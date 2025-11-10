// routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const {
  saveAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
  getMonthlyAttendance,
} = require("../controllers/attendanceController");

// POST → Save attendance
router.post("/save", saveAttendance);
// GET → Get attendance history
router.get("/history", getAttendanceHistory);
// GET → Get all attendance for a class
router.get("/class/:className", getAttendanceByClass);

// ⬇️ NEW: Monthly matrix
// GET /api/attendance/monthly?className=Grade%208%20-%20A&year=2025&month=11
router.get("/monthly", getMonthlyAttendance);
module.exports = router;
