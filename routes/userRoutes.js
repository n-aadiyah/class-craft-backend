// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs"); // use bcryptjs for wide compatibility; swap to bcrypt if needed
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "..", "uploads", "avatars");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // use either req.user.id or req.user._id
    const userId = (req.user && (req.user.id || req.user._id)) || "anon";
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${userId}-${Date.now()}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Only image files allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter,
});

// helper for safe user object
function sanitizeUser(u) {
  if (!u) return null;
  const obj = u.toObject ? u.toObject() : u;
  const { password, __v, ...rest } = obj;
  return rest;
}

// GET /api/users/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId).select("-password -__v").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /users/me error:", err);
    res.status(500).json({ message: "Error loading profile", error: err.message });
  }
});

// PUT /api/users/me
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { name, email } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (email) {
      const exists = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: userId } });
      if (exists) return res.status(400).json({ message: "Email already in use" });
    }

    const updated = await User.findByIdAndUpdate(userId, { name, email }, { new: true }).select("-password -__v").lean();
    res.json(updated);
  } catch (err) {
    console.error("PUT /users/me error:", err);
    res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// PUT /api/users/me/preferences
router.put("/me/preferences", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { notifications, theme, language } = req.body;
    const update = {};
    if (notifications !== undefined) update["preferences.notifications"] = Boolean(notifications);
    if (theme !== undefined) update["preferences.theme"] = String(theme);
    if (language !== undefined) update["preferences.language"] = String(language);

    const updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select("-password -__v").lean();
    res.json(updated);
  } catch (err) {
    console.error("PUT /users/me/preferences error:", err);
    res.status(500).json({ message: "Error updating preferences", error: err.message });
  }
});

// POST /api/users/me/avatar
// Wrap multer call to catch multer errors cleanly with try/catch
router.post("/me/avatar", authMiddleware, (req, res, next) => {
  // quick auth check
  if (!req.user || !(req.user.id || req.user._id)) return res.status(401).json({ message: "Unauthorized" });

  // call multer middleware
  upload.single("avatar")(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message || "File upload error", code: err.code });
      }
      if (err) {
        console.error("Unknown upload error:", err);
        return res.status(500).json({ message: "Upload failed", error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user.id || req.user._id;
      const avatarPath = `/uploads/avatars/${req.file.filename}`;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // delete old avatar if present and inside uploads/avatars
      if (user.avatarUrl && user.avatarUrl.startsWith("/uploads/avatars/") && !user.avatarUrl.includes("Avatar.jpg")) {
        const oldPath = path.join(__dirname, "..", user.avatarUrl);
        try {
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) {
          console.warn("Failed to delete old avatar:", e);
        }
      }

      user.avatarUrl = avatarPath;
      await user.save();

      // build full URL when possible
      const host = req.get("host");
      const protocol = req.protocol;
      const fullUrl = `${protocol}://${host}${avatarPath}`;

      res.json({ avatarUrl: avatarPath, avatarFullUrl: fullUrl });
    } catch (e) {
      console.error("POST /users/me/avatar error:", e);
      res.status(500).json({ message: "Avatar upload failed", error: e.message });
    }
  });
});

// PUT /api/users/change-password
router.put("/change-password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { currentPassword, newPassword } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Missing fields" });
    if (newPassword.length < 6) return res.status(400).json({ message: "New password too short (min 6)" });

    const user = await User.findById(userId).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(403).json({ message: "Current password incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await user.save();

    res.json({ message: "Password changed" });
  } catch (err) {
    console.error("PUT /users/change-password error:", err);
    res.status(500).json({ message: "Error changing password", error: err.message });
  }
});

// DELETE /api/users/me
router.delete("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await User.findByIdAndDelete(userId);
    res.json({ message: "Account deleted" });
  } catch (err) {
    console.error("DELETE /users/me error:", err);
    res.status(500).json({ message: "Error deleting account", error: err.message });
  }
});
// GET /api/users/unassigned-students
router.get(
  "/unassigned-students",
  authMiddleware,
  async (req, res) => {
    try {
      if (req.user.role !== "teacher" && req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      // users already linked to Student
      const assignedUserIds = await require("../models/Student").distinct("user");

      const users = await User.find({
        role: "student",
        _id: { $nin: assignedUserIds },
      })
        .select("_id email")
        .lean();

      res.json(users);
    } catch (err) {
      console.error("GET /users/unassigned-students error:", err);
      res.status(500).json({ message: "Failed to load students" });
    }
  }
);


module.exports = router;
