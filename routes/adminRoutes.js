// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { authMiddleware } = require("../middleware/authMiddleware");

console.log("✅ adminRoutes loaded");

// helper: ObjectId guard
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

// middleware: require admin role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admin only" });
  }
  next();
}

/**
 * ✅ NEW
 * GET /api/admin/dashboard-stats
 * Return summary counts for admin dashboard
 */
router.get("/dashboard-stats", authMiddleware, requireAdmin, async (req, res) => {
   console.log("🔥 DASHBOARD STATS ROUTE HIT");
  res.json({ ok: true });
  try {
    const Class = require("../models/Class");
    const Student = require("../models/Student");
    const User = require("../models/User");

    const [totalClasses, totalStudents, totalTeachers] = await Promise.all([
      Class.countDocuments(),
      Student.countDocuments(),
      User.countDocuments({ role: "teacher" }),
    ]);

    res.json({
      totalClasses,
      totalStudents,
      totalTeachers,
    });
  } catch (err) {
    console.error("GET /api/admin/dashboard-stats error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

/**
 * GET /api/admin/teachers
 * Return list of users with role 'teacher'
 */
router.get("/teachers", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const User = require("../models/User");
    const teachers = await User.find({ role: "teacher" })
      .select("name email role avatarUrl createdAt")
      .sort({ name: 1 })
      .lean();

    res.json(teachers);
  } catch (err) {
    console.error("GET /api/admin/teachers error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Error fetching teachers", error: err.message || String(err) });
  }
});

/**
 * GET /api/admin/classes
 * Return list of classes with teacher info and student count.
 */
router.get("/classes", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const Class = require("../models/Class");
    const Student = require("../models/Student");

    const classes = await Class.find()
      .sort({ name: 1 })
      .populate("teacher", "name email")
      .lean();

    const counts = await Promise.all(
      classes.map(async (c) => {
        try {
          const byClassId = await Student.countDocuments({ classId: c._id }).catch(() => null);
          if (typeof byClassId === "number") return byClassId;
          const byClass = await Student.countDocuments({ class: c._id }).catch(() => 0);
          return byClass || 0;
        } catch {
          return 0;
        }
      })
    );

    const result = classes.map((c, idx) => ({
      ...c,
      studentCount: counts[idx] || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /api/admin/classes error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Error fetching classes", error: err.message || String(err) });
  }
});

/**
 * GET /api/admin/classes/:id/students
 * Return students for a given class id
 */
router.get("/classes/:id/students", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid class id" });

    const Class = require("../models/Class");
    const Student = require("../models/Student");

    const cls = await Class.findById(id).select("name grade teacher").lean();
    if (!cls) return res.status(404).json({ message: "Class not found" });

    let students = await Student.find({ classId: id })
      .select("name enrollNo contact createdAt")
      .sort({ name: 1 })
      .lean();

    if (!students.length) {
      students = await Student.find({ class: id })
        .select("name enrollNo contact createdAt")
        .sort({ name: 1 })
        .lean();
    }

    res.json({ class: cls, students });
  } catch (err) {
    console.error("GET /api/admin/classes/:id/students error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Error fetching students for class", error: err.message || String(err) });
  }
});

module.exports = router;
