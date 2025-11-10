// routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const {
  saveAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
} = require("../controllers/attendanceController");

// POST → Save attendance
router.post("/save", saveAttendance);
// GET → Get attendance history
router.get("/history", getAttendanceHistory);
// GET → Get all attendance for a class
router.get("/class/:className", getAttendanceByClass);



module.exports = router;
