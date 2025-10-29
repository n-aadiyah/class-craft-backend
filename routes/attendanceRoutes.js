// routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const {
  saveAttendance,
  getAttendanceByClass,
} = require("../controllers/attendanceController");

// POST → Save attendance
router.post("/save", saveAttendance);

// GET → Get all attendance for a class
router.get("/:className", getAttendanceByClass);

module.exports = router;
