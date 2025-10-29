// controllers/attendanceController.js
const Attendance = require("../models/Attendance");

// ✅ Save Attendance
exports.saveAttendance = async (req, res) => {
  try {
    const { className, date, records } = req.body;

    if (!className || !records) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const attendance = new Attendance({ className, date, records });
    await attendance.save();

    res.status(201).json({
      message: "Attendance saved successfully ✅",
      attendance,
    });
  } catch (error) {
    console.error("❌ Error saving attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get Attendance by Class
exports.getAttendanceByClass = async (req, res) => {
  try {
    const { className } = req.params;
    const records = await Attendance.find({ className }).sort({ date: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Error fetching attendance" });
  }
};
