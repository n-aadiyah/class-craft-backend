// routes/questRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Quest = require("../models/Quest");
const Class = require("../models/Class");
const { authMiddleware } = require("../middleware/authMiddleware");

/* ======================================================
   CREATE QUEST
   POST /api/quests
====================================================== */
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only teachers or admins can create quests" });
    }

    const {
      title,
      description,
      classId,
      difficulty,
      rewardXP,
      startDate,
      endDate,
      status,
    } = req.body;

    if (
      !title ||
      !description ||
      !classId ||
      !difficulty ||
      rewardXP === undefined ||
      !startDate ||
      !endDate
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    // ✅ ONLY check that class exists (NOT ownership)
    const cls = await Class.findById(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    const xp = Number(rewardXP);
    if (Number.isNaN(xp) || xp < 0) {
      return res.status(400).json({ message: "rewardXP must be a valid number" });
    }

    const quest = await Quest.create({
      title: title.trim(),
      description: description.trim(),
      classId,
      difficulty,
      rewardXP: xp,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || "Active",
      createdBy: req.user.id, // keep track of creator
    });

    res.status(201).json(quest);
  } catch (err) {
    console.error("Create quest error:", err);
    res.status(500).json({
      message: "Failed to create quest",
      error: err.message,
    });
  }
});


/* ======================================================
   READ QUESTS (LIST)
   GET /api/quests?classId=
====================================================== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { classId } = req.query;

    const query =
      req.user.role === "admin"
        ? {}
        : { createdBy: req.user.id };

    if (classId) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res.status(400).json({ message: "Invalid classId" });
      }
      query.classId = classId;
    }

    const quests = await Quest.find(query)
      .populate("classId", "name grade")
      .sort({ createdAt: -1 });

    res.json(quests);
  } catch (err) {
    console.error("Fetch quests error:", err);
    res.status(500).json({ message: "Failed to fetch quests", error: err.message });
  }
});

/* ======================================================
   READ SINGLE QUEST
   GET /api/quests/:id
====================================================== */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quest id" });
    }

    const quest = await Quest.findById(id).populate("classId", "name grade");
    if (!quest) return res.status(404).json({ message: "Quest not found" });

    if (
      req.user.role === "teacher" &&
      String(quest.createdBy) !== String(req.user.id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(quest);
  } catch (err) {
    console.error("Fetch quest error:", err);
    res.status(500).json({ message: "Failed to fetch quest", error: err.message });
  }
});

/* ======================================================
   UPDATE QUEST
   PUT /api/quests/:id
====================================================== */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quest id" });
    }

    const quest = await Quest.findById(id);
    if (!quest) return res.status(404).json({ message: "Quest not found" });

    if (
      req.user.role === "teacher" &&
      String(quest.createdBy) !== String(req.user.id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updatableFields = [
      "title",
      "description",
      "difficulty",
      "rewardXP",
      "startDate",
      "endDate",
      "status",
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        quest[field] = req.body[field];
      }
    });

    await quest.save();
    res.json(quest);
  } catch (err) {
    console.error("Update quest error:", err);
    res.status(500).json({ message: "Failed to update quest", error: err.message });
  }
});

/* ======================================================
   DELETE QUEST
   DELETE /api/quests/:id
====================================================== */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quest id" });
    }

    const quest = await Quest.findById(id);
    if (!quest) return res.status(404).json({ message: "Quest not found" });

    if (
      req.user.role === "teacher" &&
      String(quest.createdBy) !== String(req.user.id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await quest.deleteOne();
    res.json({ message: "Quest deleted successfully" });
  } catch (err) {
    console.error("Delete quest error:", err);
    res.status(500).json({ message: "Failed to delete quest", error: err.message });
  }
});
/* ======================================================*/
router.post("/tasks/:questId/complete", authMiddleware, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const student = await Student.findOne({ user: req.user.id });
  const quest = await Quest.findById(req.params.questId);

  if (!student || !quest) {
    return res.status(404).json({ message: "Not found" });
  }

  // add XP
  student.xp += quest.rewardXP;

  // OPTIONAL: track completed quests
  student.completedQuests = student.completedQuests || [];
  if (!student.completedQuests.includes(quest._id)) {
    student.completedQuests.push(quest._id);
  }

  await student.save();

  res.json({
    message: "Quest completed",
    gainedXP: quest.rewardXP,
    totalXP: student.xp
  });
});


module.exports = router;
