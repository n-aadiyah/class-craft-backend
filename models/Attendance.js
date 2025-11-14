// models/Attendance.js
const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    className: { type: String, required: true },
    date: { type: Date, default: Date.now },        // original timestamp
    dateOnlyUTC: { type: Date, index: true },       // normalized UTC day (00:00 UTC)
    records: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        studentName: String,
        enrollNo: String,
        status: { type: String, enum: ["Present", "Absent"], required: true },
      },
    ],
  },
  { timestamps: true }
);

// compound indexes for fast lookups
attendanceSchema.index({ className: 1, dateOnlyUTC: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
