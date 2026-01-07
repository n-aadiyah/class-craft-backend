const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const { authMiddleware } = require("../middleware/authMiddleware");

// Models
const Class = require("../models/Class");
const Student = require("../models/Student");
const User = require("../models/User");

/* =======================
   HELPERS & MIDDLEWARE
======================= */

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id));

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admin only" });
  }
  next();
};

// Apply auth + admin guard to all routes
router.use(authMiddleware, requireAdmin);

/* =======================
   DASHBOARD
======================= */

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [totalClasses, totalStudents, totalTeachers] =
      await Promise.all([
        Class.countDocuments(),
        Student.countDocuments(),
        User.countDocuments({ role: "teacher" }),
      ]);

    res.json({ totalClasses, totalStudents, totalTeachers });
  } catch (err) {
    console.error("dashboard-stats error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

/* =======================
   TEACHERS
======================= */

router.get("/teachers", async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher" })
      .select("name email role avatarUrl createdAt")
      .sort({ name: 1 })
      .lean();

    res.json(teachers);
  } catch (err) {
    console.error("teachers error:", err);
    res.status(500).json({ message: "Error fetching teachers" });
  }
});

/* =======================
   CLASSES
======================= */

router.get("/classes", async (req, res) => {
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

        return { ...cls, studentCount: count };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("classes error:", err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

router.get("/classes/:id/students", async (req, res) => {
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

    res.json({ class: cls, students });
  } catch (err) {
    console.error("class students error:", err);
    res.status(500).json({ message: "Error fetching students for class" });
  }
});

/* =======================
   USERS & ROLES
======================= */

router.get("/users", async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(users);
  } catch (err) {
    console.error("users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // ✅ schema-aligned roles
    if (!["admin", "teacher", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role value" });
    }

    // prevent self-demotion
    if (req.user.id === id && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own admin access",
      });
    }

    // prevent removing last admin
    if (role !== "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "At least one admin must exist",
        });
      }
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = role;
    await user.save();

    res.json({
      message: "User role updated successfully",
      userId: user._id,
      role: user.role,
    });
  } catch (err) {
    console.error("PATCH /admin/users/:id error:", err);
    res.status(500).json({ message: "Failed to update user role" });
  }
});

module.exports = router;
