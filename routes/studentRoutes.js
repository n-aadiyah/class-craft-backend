const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Student = require("../models/Student");
const Quest = require("../models/Quest"); // ✅ REQUIRED

const Class = require("../models/Class");
const { authMiddleware } = require("../middleware/authMiddleware");

/* =======================
   HELPERS
======================= */

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id));

function parseSectionFromClassName(name = "") {
  if (!name) return "A";
  const dashMatch = name.match(/-\s*([A-Za-z])\s*$/);
  if (dashMatch) return dashMatch[1].toUpperCase();
  const tokens = name.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (/^[A-Za-z]$/.test(last)) return last.toUpperCase();
  return "A";
}

async function ensureClassOwnershipOrAdmin(classId, user) {
  const cls = await Class.findById(classId)
    .select("teacher name studentsLimit");

  if (!cls) {
    const e = new Error("Class not found");
    e.code = 404;
    throw e;
  }

  if (
    String(cls.teacher) !== String(user.id) &&
    user.role !== "admin"
  ) {
    const e = new Error("Forbidden");
    e.code = 403;
    throw e;
  }

  return cls;
}

/* =======================
   ROUTES
======================= */

/**
 * ✅ GET /dashboard
 * Student dashboard (MUST BE FIRST)
 */
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    // only students allowed
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // find student linked to user
    const student = await Student.findOne({ user: req.user.id })
      .populate("classId", "name grade");

    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    // fetch quests assigned to student's class
    const quests = await Quest.find({
      classId: student.classId,
      status: "Active",
    }).sort({ startDate: 1 });

    // derived values (safe defaults)
    const completedTasks = 0; // future: from submissions
    const totalTasks = quests.length;

    res.json({
      student: {
        _id: student._id,
        name: student.name,
        level: student.level,
        xp: student.xp,
        nextLevelXp: (student.level + 1) * 100,
        completedTasks,
        totalTasks,
        xpHistory: student.xpHistory || [],
        enrollmentNo: student.enrollNo,
        course: student.classId?.name,
        batch: student.classId?.grade,
        bio: student.bio || "",
      },
      quests, // 👈 optional (for tasks page later)
    });
  } catch (err) {
    console.error("Student dashboard error:", err);
    res.status(500).json({
      message: "Failed to load student dashboard",
      error: err.message,
    });
  }
});
router.get("/tasks", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    const quests = await Quest.find({
      classId: student.classId,
      status: "Active",
    }).lean();

    const completedSet = new Set(
      student.completedQuests.map((c) => String(c.quest))
    );

    const tasks = quests.map((q) => ({
      _id: q._id,
      title: q.title,
      description: q.description,
      xp: q.rewardXP,
      dueDate: q.endDate,
      status: completedSet.has(String(q._id))
        ? "completed"
        : "pending",
    }));

    res.json(tasks);
  } catch (err) {
    console.error("Student tasks error:", err);
    res.status(500).json({ message: "Failed to load student tasks" });
  }
});
router.post("/tasks/:id/complete", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const questId = req.params.id;
    if (!isValidId(questId)) {
      return res.status(400).json({ message: "Invalid task id" });
    }

    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const alreadyCompleted = student.completedQuests.some(
      (c) => String(c.quest) === questId
    );

    if (alreadyCompleted) {
      return res.status(400).json({ message: "Task already completed" });
    }

    const quest = await Quest.findById(questId);
    if (!quest) {
      return res.status(404).json({ message: "Task not found" });
    }

    // award XP
    student.xp += quest.rewardXP;

    student.completedQuests.push({
      quest: quest._id,
    });

    await student.save();

    res.json({ message: "Task completed successfully" });
  } catch (err) {
    console.error("Complete task error:", err);
    res.status(500).json({ message: "Failed to complete task" });
  }
});

/**
 * GET /count-by-teacher
 */
router.get("/count-by-teacher", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const classes = await Class.find({ teacher: req.user.id })
      .select("_id")
      .lean();

    const classIds = classes.map((c) => c._id);
    if (!classIds.length) {
      return res.json({ totalStudents: 0 });
    }

    const totalStudents = await Student.countDocuments({
      classId: { $in: classIds },
    });

    res.json({ totalStudents });
  } catch (err) {
    console.error("count-by-teacher error:", err);
    res.status(500).json({ message: "Error counting students" });
  }
});

/**
 * GET /
 * Admin: all students
 * Teacher: own students
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user.role === "admin") {
      const students = await Student.find()
        .populate("classId", "name grade")
        .populate("user", "email")
        .sort({ name: 1 })
        .lean();
      return res.json(students);
    }

    const classes = await Class.find({ teacher: req.user.id })
      .select("_id")
      .lean();

    const classIds = classes.map((c) => c._id);

    const students = await Student.find({ classId: { $in: classIds } })
      .populate("classId", "name grade")
      .populate("user", "email")
      .sort({ name: 1 })
      .lean();

    res.json(students);
  } catch (err) {
    console.error("GET /students error:", err);
    res.status(500).json({ message: "Error fetching students" });
  }
});

/**
 * GET /class/:classId
 */
router.get("/class/:classId", authMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    if (!isValidId(classId)) {
      return res.status(400).json({ message: "Invalid class id" });
    }

    await ensureClassOwnershipOrAdmin(classId, req.user);

    const students = await Student.find({ classId })
      .populate("classId", "name grade")
      .sort({ name: 1 })
      .lean();

    res.json(students);
  } catch (err) {
    res
      .status(err.code || 500)
      .json({ message: err.message || "Error" });
  }
});
router.get("/rewards", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const rewards = await Reward.find({ student: student._id })
      .populate("classId", "name grade")
      .sort({ date: -1 })
      .lean();

    res.json(rewards);
  } catch (err) {
    console.error("Student rewards error:", err);
    res.status(500).json({
      message: "Failed to load rewards",
      error: err.message,
    });
  }
});

/**
 * ⚠️ MUST BE LAST
 * GET /:id
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    const student = await Student.findById(req.params.id)
      .populate("classId", "name grade")
      .populate("user", "email");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const cls = await Class.findById(student.classId).select("teacher");
    if (!cls) {
      return res.status(400).json({
        message: "Class not found for this student",
      });
    }

    if (
      String(cls.teacher) !== String(req.user.id) &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(student);
  } catch (err) {
    console.error("GET /students/:id error:", err);
    res.status(500).json({ message: "Error fetching student" });
  }
});

/**
 * POST /
 * Create student
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { name, contact, classId, enrollNo, userId } = req.body;

    // ✅ Required fields
    if (!name || !contact || !classId) {
      return res.status(400).json({
        message: "Missing fields: name, contact, classId",
      });
    }

    // ✅ classId must always be valid
    if (!isValidId(classId)) {
      return res.status(400).json({ message: "Invalid class id" });
    }

    // ✅ userId is OPTIONAL — validate ONLY if present
    if (userId && !isValidId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // ✅ If userId provided, ensure no duplicate student profile
    if (userId) {
      const existing = await Student.findOne({ user: userId });
      if (existing) {
        return res.status(400).json({
          message: "This user already has a student profile",
        });
      }
    }

    const cls = await ensureClassOwnershipOrAdmin(classId, req.user);

    const count = await Student.countDocuments({ classId });
    if (cls.studentsLimit && count >= cls.studentsLimit) {
      return res.status(400).json({
        message: `Class limit reached (${cls.studentsLimit})`,
      });
    }

    // ✅ Auto-generate enrollNo if missing
    let finalEnroll = enrollNo;
    if (!finalEnroll) {
      const section = parseSectionFromClassName(cls.name);
      const regex = new RegExp(`^${section}(\\d+)$`, "i");

      const existingEnrolls = await Student.find({ classId })
        .select("enrollNo")
        .lean();

      let max = 0;
      for (const s of existingEnrolls) {
        const m = s.enrollNo?.match(regex);
        if (m) max = Math.max(max, Number(m[1]));
      }

      finalEnroll = `${section}${String(max + 1).padStart(2, "0")}`;
    }

    // ✅ Create student (attach user only if provided)
    const student = await Student.create({
      name,
      contact,
      enrollNo: finalEnroll,
      classId,
      ...(userId ? { user: userId } : {}),
    });

    res.status(201).json(student);
  } catch (err) {
    console.error("POST /students error:", err);
    res.status(500).json({ message: "Failed to create student" });
  }
});

/**
 * PUT /:id
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    const existing = await Student.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    const cls = await Class.findById(existing.classId).select("teacher");
    if (
      String(cls.teacher) !== String(req.user.id) &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("classId", "name grade");

    res.json(updated);
  } catch (err) {
    console.error("PUT /students error:", err);
    res.status(400).json({ message: err.message });
  }
});

/**
 * DELETE /:id
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const cls = await Class.findById(student.classId).select("teacher");
    if (
      String(cls.teacher) !== String(req.user.id) &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await student.deleteOne();
    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("DELETE /students error:", err);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
