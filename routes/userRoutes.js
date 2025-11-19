const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");

// === Multer (avatar upload) configuration ===
// Ensure this folder exists: ./uploads/avatars
const uploadDir = path.join(__dirname, "..", "uploads", "avatars");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ext === ".png" || ext === ".jpg" || ext === ".jpeg" ? ext : ".jpg";
    cb(null, `${req.user.id}-${Date.now()}${safeExt}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files allowed"), false);
  cb(null, true);
};
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter });

// ===== Helper =====
function sanitizeUser(u) {
  if (!u) return null;
  const { password, __v, ...rest } = u.toObject ? u.toObject() : u;
  return rest;
}

// --- GET /api/users/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password -__v").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /users/me error:", err);
    res.status(500).json({ message: "Error loading profile", error: err.message });
  }
});

// --- PUT /api/users/me  (update name/email)
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;

    // validate email uniqueness if changed
    if (email) {
      const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (exists) return res.status(400).json({ message: "Email already in use" });
    }

    const updated = await User.findByIdAndUpdate(userId, { name, email }, { new: true }).select("-password -__v").lean();
    res.json(updated);
  } catch (err) {
    console.error("PUT /users/me error:", err);
    res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// --- PUT /api/users/me/preferences
router.put("/me/preferences", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const prefs = req.body;
    const allowed = {
      notifications: Boolean,
      theme: String,
      language: String,
    };

    // Build safe update object
    const update = {};
    if (prefs.notifications !== undefined) update["preferences.notifications"] = Boolean(prefs.notifications);
    if (prefs.theme) update["preferences.theme"] = String(prefs.theme);
    if (prefs.language) update["preferences.language"] = String(prefs.language);

    const updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select("-password -__v").lean();
    res.json(updated);
  } catch (err) {
    console.error("PUT /users/me/preferences error:", err);
    res.status(500).json({ message: "Error updating preferences", error: err.message });
  }
});

// --- POST /api/users/me/avatar (multipart/form-data, field name 'avatar')
router.post("/me/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const avatarPath = `/uploads/avatars/${req.file.filename}`; // serve statically in express or use full URL
    // optional: delete old avatar file if exists and is not default
    const user = await User.findById(req.user.id);
    if (user?.avatarUrl && !user.avatarUrl.includes("Avatar.jpg") && user.avatarUrl.startsWith("/uploads/avatars/")) {
      const old = path.join(__dirname, "..", user.avatarUrl);
      fs.unlink(old, (err) => { if (err) {/* ignore */} });
    }
    user.avatarUrl = avatarPath;
    await user.save();
    res.json({ avatarUrl: avatarPath });
  } catch (err) {
    console.error("POST /users/me/avatar error:", err);
    res.status(500).json({ message: "Avatar upload failed", error: err.message });
  }
});

// --- PUT /api/users/change-password
router.put("/change-password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
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

// --- DELETE /api/users/me
router.delete("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    // Optional: verify password again by reading from req.body.currentPassword
    // Soft-delete recommended; here we remove
    await User.findByIdAndDelete(userId);
    res.json({ message: "Account deleted" });
  } catch (err) {
    console.error("DELETE /users/me error:", err);
    res.status(500).json({ message: "Error deleting account", error: err.message });
  }
});

module.exports = router;
