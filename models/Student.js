const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one user = one student
    },

    name: { type: String, required: true },
    enrollNo: { type: String, required: true },
    contact: { type: String, required: true },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
completedQuests: [
  {
    quest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quest",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
],

    // ✅ XP HISTORY (correct placement)
    xpHistory: [
      {
        xp: { type: Number, required: true },
        source: { type: String, required: true }, // "reward" | "quest" | "admin"
        reason: { type: String },
        date: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);
