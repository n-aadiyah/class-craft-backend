const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Class = require("../models/Class");

/**
 * Helper - parse section letter from class name.
 * Example: "Grade 8 - A" -> "A"; "Class 4 B" -> "B"; fallback -> "A"
 */
function parseSectionFromClassName(name = "") {
  if (!name) return "A";
  // look for "- <letter>" or last token single letter
  const dashMatch = name.match(/-\s*([A-Za-z])\s*$/);
  if (dashMatch) return dashMatch[1].toUpperCase();
  const tokens = name.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (/^[A-Za-z]$/.test(last)) return last.toUpperCase();
  return "A";
}

/**
 * GET / -> all students (alphabetical)
 */
router.get("/", async (req, res) => {
  try {
    const students = await Student.find().populate("classId", "name grade").sort({ name: 1 });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students", error });
  }
});

/**
 * GET /class/:classId -> students for a specific class (alphabetical)
 */
router.get("/class/:classId", async (req, res) => {
  try {
    const students = await Student.find({ classId: req.params.classId })
      .populate("classId", "name grade")
      .sort({ name: 1 });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students for class", error });
  }
});

/**
 * GET /:id -> single student
 */
router.get("/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate("classId", "name grade");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: "Error fetching student", error });
  }
});

/**
 * POST / -> add new student
 * Enforces class studentsLimit and auto-generates enrollNo if missing
 */
router.post("/", async (req, res) => {
  try {
    const { name, enrollNo, contact, classId } = req.body;
    if (!name || !contact || !classId) {
      return res.status(400).json({ message: "Missing required fields: name, contact, classId" });
    }

    // Find class -> to read studentsLimit and class name (for section)
    const cls = await Class.findById(classId).select("studentsLimit name");
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

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
      // Find max numeric suffix for this class & section
      // Accept patterns like A01, A1, A001 etc. We'll parse trailing digits.
      const regex = new RegExp(`^${section}(\\d+)$`, "i");
      const existing = await Student.find({ classId, enrollNo: { $regex: `^${section}\\d+$`, $options: "i" } })
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
      // format with at least 2 digits (A01). If >99 it will grow naturally.
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
    // return full student with populated class
    const populated = await Student.findById(savedStudent._id).populate("classId", "name grade");
    res.status(201).json(populated);
  } catch (error) {
    console.error("Error adding student:", error);
    // duplicate key for enrollNo
    if (error.code === 11000 && error.keyPattern && error.keyValue) {
      return res.status(400).json({ message: "Enroll number already exists", error: error.keyValue });
    }
    res.status(400).json({ message: "Error adding student", error });
  }
});

/**
 * PUT /:id -> update student
 * (no limit enforced here because updating doesn't change class membership by default.
 * If updating classId to a new class, you may want to enforce limit there as well.)
 */
router.put("/:id", async (req, res) => {
  try {
    const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("classId", "name grade");
    if (!updatedStudent) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("Error updating student:", error);
    if (error.code === 11000 && error.keyPattern && error.keyValue) {
      return res.status(400).json({ message: "Enroll number already exists", error: error.keyValue });
    }
    res.status(400).json({ message: "Error updating student", error });
  }
});

/**
 * DELETE /:id -> delete student
 */
router.delete("/:id", async (req, res) => {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent) return res.status(404).json({ message: "Student not found" });
    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(400).json({ message: "Error deleting student", error });
  }
});

module.exports = router;
