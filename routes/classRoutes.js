const express = require("express");
const router = express.Router();
const Class = require("../models/Class");

// ✅ Get all classes
router.get("/", async (req, res) => {
  try {
    const classes = await Class.find();
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: "Error fetching classes", error });
  }
});

// ✅ Add new class
router.post("/", async (req, res) => {
  try {
    const newClass = new Class(req.body);
    const savedClass = await newClass.save();
    res.status(201).json(savedClass);
  } catch (error) {
    res.status(400).json({ message: "Error adding class", error });
  }
});
// ✅ Get class by ID
router.get("/:id", async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) return res.status(404).json({ message: "Class not found" });
    res.json(classItem);
  } catch (error) {
    res.status(500).json({ message: "Error fetching class", error });
  }
});


// ✅ Update class
router.put("/:id", async (req, res) => {
  try {
    const updated = await Class.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: "Error updating class", error });
  }
});

// ✅ Delete class
router.delete("/:id", async (req, res) => {
  try {
    await Class.findByIdAndDelete(req.params.id);
    res.json({ message: "Class deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting class", error });
  }
});
module.exports = router;
