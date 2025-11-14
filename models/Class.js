const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true},
    grade: { type: String, required: true},
    studentsLimit: { type: Number, required: false },
    startDate: { type: Date, required: false },
    endDate: { type: Date, required: false },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Class", classSchema);
