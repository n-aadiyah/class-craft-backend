// routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const {
  saveAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
  getMonthlyAttendance
} = require("../controllers/attendanceController");
const { authMiddleware } = require("../middleware/authMiddleware");

// secure endpoints
router.post("/save", authMiddleware, saveAttendance);
router.get("/history", authMiddleware, getAttendanceHistory);
router.get("/class/:className", authMiddleware, getAttendanceByClass);
router.get("/monthly", authMiddleware, getMonthlyAttendance);

module.exports = router;
