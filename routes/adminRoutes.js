// routes/adminRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const { authMiddleware } = require("../middleware/authMiddleware");

// Models (loaded once)
const Class = require("../models/Class");
const Student = require("../models/Student");
const User = require("../models/User");

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
 * GET /api/admin/dashboard-stats
 * Return summary counts for admin dashboard
 */
router.get(
  "/dashboard-stats",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const [totalClasses, totalStudents, totalTeachers] =
        await Promise.all([
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
      console.error("dashboard-stats error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  }
);

/**
 * GET /api/admin/teachers
 * Return list of users with role 'teacher'
 */
router.get(
  "/teachers",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const teachers = await User.find({ role: "teacher" })
        .select("name email role avatarUrl createdAt")
        .sort({ name: 1 })
        .lean();

      res.json(teachers);
    } catch (err) {
      console.error("teachers error:", err);
      res
        .status(500)
        .json({ message: "Error fetching teachers" });
    }
  }
);

/**
 * GET /api/admin/classes
 * Return list of classes with teacher info and student count
 */
router.get(
  "/classes",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const classes = await Class.find()
        .sort({ name: 1 })
        .populate("teacher", "name email")
        .lean();

      const result = await Promise.all(
        classes.map(async (cls) => {
          const count =
            (await Student.countDocuments({ class: cls._id })) ||
            (await Student.countDocuments({ classId: cls._id })) ||
            0;

          return {
            ...cls,
            studentCount: count,
          };
        })
      );

      res.json(result);
    } catch (err) {
      console.error("classes error:", err);
      res
        .status(500)
        .json({ message: "Error fetching classes" });
    }
  }
);

/**
 * GET /api/admin/classes/:id/students
 * Return students for a given class id
 */
router.get(
  "/classes/:id/students",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid class id" });
      }

      const cls = await Class.findById(id)
        .select("name grade teacher")
        .lean();

      if (!cls) {
        return res.status(404).json({ message: "Class not found" });
      }

      let students = await Student.find({ class: id })
        .select("name enrollNo contact createdAt")
        .sort({ name: 1 })
        .lean();

      // backward compatibility
      if (!students.length) {
        students = await Student.find({ classId: id })
          .select("name enrollNo contact createdAt")
          .sort({ name: 1 })
          .lean();
      }

      res.json({
        class: cls,
        students,
      });
    } catch (err) {
      console.error("class students error:", err);
      res
        .status(500)
        .json({ message: "Error fetching students for class" });
    }
  }
);

module.exports = router;
