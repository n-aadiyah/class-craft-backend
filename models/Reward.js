const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    xp: {
      type: Number,
      required: true,
      min: 0,
    },
    badge: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

/* ✅ THIS LINE IS CRITICAL */
module.exports = mongoose.model("Reward", rewardSchema);
