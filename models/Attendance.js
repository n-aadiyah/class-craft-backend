// models/Attendance.js
const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    records: [
      {
        studentId: {
          type: String,
          required: true,
        },
        studentName: String,
        enrollNo: String,
        status: {
          type: String,
          enum: ["Present", "Absent"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
