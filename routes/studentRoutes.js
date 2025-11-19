// routes/studentRoutes.js
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Class = require("../models/Class");
const { authMiddleware } = require("../middleware/authMiddleware"); // must exist and set req.user

/**
 * Helper - parse section letter from class name.
 * Example: "Grade 8 - A" -> "A"; "Class 4 B" -> "B"; fallback -> "A"
 */
function parseSectionFromClassName(name = "") {
  if (!name) return "A";
  const dashMatch = name.match(/-\s*([A-Za-z])\s*$/);
  if (dashMatch) return dashMatch[1].toUpperCase();
  const tokens = name.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (/^[A-Za-z]$/.test(last)) return last.toUpperCase();
  return "A";
}

/**
 * Helper - check that current user can access/modify the class
 * (owner teacher or admin)
 */
async function ensureClassOwnershipOrAdmin(classId, user) {
  const cls = await Class.findById(classId).select("teacher name studentsLimit");
  if (!cls) {
    const e = new Error("Class not found");
    e.code = 404;
    throw e;
  }
  if (String(cls.teacher) !== String(user.id) && user.role !== "admin") {
    const e = new Error("Forbidden");
    e.code = 403;
    throw e;
  }
  return cls;
}

/**
 * GET / -> all students (alphabetical)
 * - Admin: returns all students
 * - Teacher: returns students belonging to teacher's classes
 */
router.get("/count-by-teacher", authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ message: "Unauthorized" });

    // Find class ids owned by the teacher
    const classes = await Class.find({ teacher: teacherId }).select("_id").lean();
    const classIds = classes.map((c) => c._id);
    if (classIds.length === 0) {
      return res.json({ totalStudents: 0 });
    }

    // Count students whose classId is in teacher's classes
    const totalStudents = await Student.countDocuments({ classId: { $in: classIds } });

    return res.json({ totalStudents });
  } catch (err) {
    console.error("Error in GET /students/count-by-teacher:", err);
    return res.status(500).json({ message: "Error counting students", error: err.message });
  }
});
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const students = await Student.find().populate("classId", "name grade").sort({ name: 1 }).lean();
      return res.status(200).json(students);
    }
    // teacher -> fetch their classes, then students in those classes
    const classes = await Class.find({ teacher: req.user.id }).select("_id").lean();
    const classIds = classes.map((c) => c._id);
    const students = await Student.find({ classId: { $in: classIds } })
      .populate("classId", "name grade")
      .sort({ name: 1 })
      .lean();
    return res.status(200).json(students);
  } catch (error) {
    console.error("GET /students error:", error);
    res.status(500).json({ message: "Error fetching students", error: error.message });
  }
});

/**
 * GET /class/:classId -> students for a specific class (alphabetical)
 * - Only teacher-owner or admin may call
 */
router.get("/class/:classId", authMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    await ensureClassOwnershipOrAdmin(classId, req.user);
    const students = await Student.find({ classId })
      .populate("classId", "name grade")
      .sort({ name: 1 })
      .lean();
    res.status(200).json(students);
  } catch (error) {
    console.error("GET /students/class/:classId error:", error);
    const code = error.code || 500;
    res.status(code).json({ message: error.message || "Error fetching students for class", error: error.message });
  }
});

/**
 * GET /:id -> single student
 * - Teacher may only view if student belongs to their class; admin can view all.
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate("classId", "name grade");
    if (!student) return res.status(404).json({ message: "Student not found" });

    // ownership check
    const cls = await Class.findById(student.classId).select("teacher");
    if (String(cls.teacher) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error("GET /students/:id error:", error);
    res.status(500).json({ message: "Error fetching student", error: error.message });
  }
});

/**
 * POST / -> add new student
 * Enforces class studentsLimit and auto-generates enrollNo if missing
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, enrollNo, contact, classId } = req.body;
    if (!name || !contact || !classId) {
      return res.status(400).json({ message: "Missing required fields: name, contact, classId" });
    }

    // verify class and ownership
    const cls = await ensureClassOwnershipOrAdmin(classId, req.user); // returns cls (or throws)
    // Count existing students in the class
    const currentCount = await Student.countDocuments({ classId });

    if (typeof cls.studentsLimit === "number" && cls.studentsLimit > 0 && currentCount >= cls.studentsLimit) {
      return res.status(400).json({
        message: `Class limit reached (${cls.studentsLimit}). Cannot add more students.`,
      });
    }

    let finalEnroll = enrollNo;

    // If enrollNo not provided, auto-generate based on section letter
    if (!finalEnroll) {
      const section = parseSectionFromClassName(cls.name); // e.g. "A" or "B"
      // Accept patterns like A01, A1, A001 etc.
const regex = new RegExp(`^${section}\\s*0*(\\d+)$`, "i");
      const existing = await Student.find({ classId,enrollNo: { $regex: `^${section}\\s*\\d+$`, $options: "i" }
 })
        .select("enrollNo")
        .lean();

      let maxNum = 0;
      for (const s of existing) {
        const m = s.enrollNo && s.enrollNo.match(regex);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      const next = maxNum + 1;
      const numStr = next < 10 ? `0${next}` : String(next);
      finalEnroll = `${section}${numStr}`;
    }

    const newStudent = new Student({
      name,
      enrollNo: finalEnroll,
      contact,
      classId,
    });

    const savedStudent = await newStudent.save();
    const populated = await Student.findById(savedStudent._id).populate("classId", "name grade");
    res.status(201).json(populated);
  } catch (error) {
    console.error("POST /students error:", error);
    if (error.code === 11000 && error.keyPattern && error.keyValue) {
      return res.status(400).json({ message: "Enroll number already exists", error: error.keyValue });
    }
    if (error.code && error.message) {
      return res.status(error.code).json({ message: error.message });
    }
    res.status(400).json({ message: "Error adding student", error: error.message || error });
  }
});

/**
 * PUT /:id -> update student
 * - If classId is changed, enforce ownership and the target class studentsLimit.
 * - Only owner teacher or admin can update.
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Student not found" });

    // Check permission on current class
    const currentClass = await Class.findById(existing.classId).select("teacher name studentsLimit");
    if (!currentClass) return res.status(400).json({ message: "Student's class not found" });
    if (String(currentClass.teacher) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // If classId being changed -> ensure target class ownership + limit
    if (req.body.classId && String(req.body.classId) !== String(existing.classId)) {
      const targetClass = await Class.findById(req.body.classId).select("teacher studentsLimit name");
      if (!targetClass) return res.status(404).json({ message: "Target class not found" });
      if (String(targetClass.teacher) !== String(req.user.id) && req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden to move student to this class" });
      }
      const targetCount = await Student.countDocuments({ classId: req.body.classId });
      if (typeof targetClass.studentsLimit === "number" && targetClass.studentsLimit > 0 && targetCount >= targetClass.studentsLimit) {
        return res.status(400).json({ message: `Target class limit reached (${targetClass.studentsLimit})` });
      }
    }

    const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("classId", "name grade");
    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("PUT /students/:id error:", error);
    if (error.code === 11000 && error.keyPattern && error.keyValue) {
      return res.status(400).json({ message: "Enroll number already exists", error: error.keyValue });
    }
    res.status(400).json({ message: "Error updating student", error: error.message || error });
  }
});

/**
 * DELETE /:id -> delete student
 * - Only owner teacher or admin can delete
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Student not found" });

    const cls = await Class.findById(existing.classId).select("teacher");
    if (!cls) return res.status(400).json({ message: "Class not found for this student" });
    if (String(cls.teacher) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await Student.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("DELETE /students/:id error:", error);
    res.status(400).json({ message: "Error deleting student", error: error.message || error });
  }
});

module.exports = router;
