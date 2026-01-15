const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Reward = require("../models/Reward");
const Student = require("../models/Student");
const Class = require("../models/Class");
const { authMiddleware } = require("../middleware/authMiddleware");
/* ====================================================== */
console.log("Reward is:", Reward);
console.log("Reward.create:", typeof Reward.create);

router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { studentId, classId, xp, badge, reason, date } = req.body;

    if (!studentId || !classId || xp === undefined || !badge || !date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const reward = await Reward.create({
      student: studentId,
      classId,
      xp: Number(xp),
      badge,
      reason,
      date: new Date(date),
      createdBy: req.user.id,
    });

    // 🔥 IMPORTANT: increment student XP
    await Student.findByIdAndUpdate(studentId, {
  $inc: { xp: Number(xp) },
  $push: {
    xpHistory: {
      xp: Number(xp),
      source: "reward",
      reason,
      date: new Date(),
    },
  },
});


    res.status(201).json(reward);
  } catch (err) {
    console.error("Create reward error:", err);
    res.status(500).json({
      message: "Failed to create reward",
      error: err.message,
    });
  }
});



router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const query =
      req.user.role === "admin"
        ? {}
        : { createdBy: req.user.id };

    const rewards = await Reward.find(query)
      .populate("student", "name enrollNo")
      .populate("classId", "name grade")
      .sort({ createdAt: -1 });

    res.json(rewards);
  } catch (err) {
    console.error("Fetch rewards error:", err);
    res.status(500).json({ message: "Failed to fetch rewards" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const reward = await Reward.findById(req.params.id);
    if (!reward) return res.status(404).json({ message: "Reward not found" });

    // rollback XP
    const student = await Student.findById(reward.student);
    if (student) {
      student.xp = Math.max(0, student.xp - reward.xp);
      await student.save();
    }

    await reward.deleteOne();
    res.json({ message: "Reward deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete reward" });
  }
});
module.exports = router;