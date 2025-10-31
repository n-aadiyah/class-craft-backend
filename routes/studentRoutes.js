const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

// ✅ Get all students (optional — for admin overview)
router.get("/", async (req, res) => {
  try {
    const students = await Student.find().populate("classId", "name grade");
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students", error });
  }
});

// ✅ Get all students for a specific class
router.get("/class/:classId", async (req, res) => {
  try {
    const students = await Student.find({ classId: req.params.classId });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students for class", error });
  }
});

// ✅ Get single student by ID
router.get("/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate("classId", "name grade");
    if (!student)
      return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: "Error fetching student", error });
  }
});

// ✅ Add new student
router.post("/", async (req, res) => {
  try {
    const newStudent = new Student(req.body);
    const savedStudent = await newStudent.save();
    res.status(201).json(savedStudent);
  } catch (error) {
    res.status(400).json({ message: "Error adding student", error });
  }
});

// ✅ Update student
router.put("/:id", async (req, res) => {
  try {
    const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedStudent)
      return res.status(404).json({ message: "Student not found" });
    res.status(200).json(updatedStudent);
  } catch (error) {
    res.status(400).json({ message: "Error updating student", error });
  }
});

// ✅ Delete student
router.delete("/:id", async (req, res) => {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent)
      return res.status(404).json({ message: "Student not found" });
    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting student", error });
  }
});

module.exports = router;
