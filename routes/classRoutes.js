// routes/classRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Class = require("../models/Class");
const { authMiddleware } = require("../middleware/authMiddleware");

// helper: ensure user has one of allowed roles
function ensureRole(user, allowed = []) {
  if (!user || !user.role) return false;
  return allowed.includes(user.role);
}

// simple ObjectId guard
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

/**
 * POST /api/classes
 * Create class — only teacher or admin
 * Request body: { name, grade, studentsLimit, startDate, endDate }
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!ensureRole(req.user, ["teacher", "admin"])) {
      return res.status(403).json({ message: "Only teacher or admin can create classes" });
    }

    const { name, grade, studentsLimit, startDate, endDate } = req.body;

    if (!name || !grade) {
      return res.status(400).json({ message: "Missing required fields: name, grade" });
    }

    const limitNum = studentsLimit !== undefined ? Number(studentsLimit) : undefined;
    if (limitNum !== undefined && (!Number.isInteger(limitNum) || limitNum < 0)) {
      return res.status(400).json({ message: "studentsLimit must be a non-negative integer" });
    }

    const payload = {
      name: String(name).trim(),
      grade: String(grade).trim(),
      studentsLimit: limitNum,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      teacher: req.user.id,
    };

    const cls = await Class.create(payload);
    // populate teacher minimal info before return
    const populated = await Class.findById(cls._id).populate("teacher", "name email").lean();
    res.status(201).json(populated);
  } catch (err) {
    console.error("Error creating class:", err);
    res.status(400).json({ message: "Error creating class", error: err.message });
  }
});

/**
 * GET /api/classes/my-classes
 * Returns classes owned by authenticated teacher (admin will receive all)
 */
router.get("/my-classes", authMiddleware, async (req, res) => {
  try {
    const query = {};
    if (req.user.role === "teacher") {
      query.teacher = req.user.id;
    }
    // admins get all; other roles get only theirs (fallback)
    const classes = await Class.find(query).sort({ name: 1 }).populate("teacher", "name email").lean();
    res.json(classes);
  } catch (err) {
    console.error("Error fetching my-classes:", err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

/**
 * GET /api/classes
 * Admin: all classes
 * Teacher: own classes
 * Others: empty or teacher-specific fallback
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const list = await Class.find().sort({ name: 1 }).populate("teacher", "name email").lean();
      return res.json(list);
    }
    // non-admins: show only their classes (teacher) or none
    const list = await Class.find({ teacher: req.user.id }).sort({ name: 1 }).populate("teacher", "name email").lean();
    return res.json(list);
  } catch (err) {
    console.error("Error in GET /classes:", err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

/**
 * PUT /api/classes/:id
 * Update — owner (teacher) or admin only
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid class id" });

    const cls = await Class.findById(id);
    if (!cls) return res.status(404).json({ message: "Class not found" });

    if (String(cls.teacher) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Validate inputs if present
    if (req.body.studentsLimit !== undefined) {
      const s = Number(req.body.studentsLimit);
      if (!Number.isInteger(s) || s < 0) return res.status(400).json({ message: "studentsLimit must be a non-negative integer" });
      cls.studentsLimit = s;
    }
    if (req.body.name !== undefined) cls.name = String(req.body.name).trim();
    if (req.body.grade !== undefined) cls.grade = String(req.body.grade).trim();
    if (req.body.startDate !== undefined) cls.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) cls.endDate = new Date(req.body.endDate);

    await cls.save();
    const populated = await Class.findById(cls._id).populate("teacher", "name email").lean();
    res.json(populated);
  } catch (err) {
    console.error("Error updating class:", err);
    res.status(400).json({ message: "Error updating class", error: err.message });
  }
});

/**
 * DELETE /api/classes/:id
 * Delete — owner or admin only
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid class id" });

    const cls = await Class.findById(id);
    if (!cls) return res.status(404).json({ message: "Class not found" });

    if (String(cls.teacher) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await cls.remove();
    res.json({ message: "Class deleted" });
  } catch (err) {
    console.error("Error deleting class:", err);
    res.status(400).json({ message: "Error deleting class", error: err.message });
  }
});

module.exports = router;
