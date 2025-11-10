// models/Attendance.js
const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true,
    },

    // Original timestamp (kept for compatibility / exact time saved)
    date: {
      type: Date,
      default: Date.now,
    },

    // NEW: normalized day (00:00:00.000Z) used to ensure 1 doc per class per day
    dateOnlyUTC: {
      type: Date,
      required: true,
    },

    records: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
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

// Normalize dateOnlyUTC on validate/save (works for creates; for upserts set it in controller too)
attendanceSchema.pre("validate", function (next) {
  const src = this.date ? new Date(this.date) : new Date();
  const norm = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate(), 0, 0, 0, 0));
  this.dateOnlyUTC = norm;
  next();
});

// 🔎 Fast queries
attendanceSchema.index({ className: 1, date: -1 });

// ✅ Enforce one document per class per day
attendanceSchema.index({ className: 1, dateOnlyUTC: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
