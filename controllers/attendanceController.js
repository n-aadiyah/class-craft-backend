// controllers/attendanceController.js
const Attendance = require("../models/Attendance");

// GET /api/attendance/history?className=Grade%208%20-%20A&date=2025-11-10
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { className, date } = req.query;

    if (!className) {
      return res.status(400).json({ message: "className query param is required" });
    }

    let session; // one attendance session (for a date) to show in the table

    if (date) {
      // normalize to day
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      session = await Attendance.findOne({
        className,
        date: { $gte: start, $lt: end },
      }).sort({ date: -1 });
    } else {
      // no date selected → show latest session for the class
      session = await Attendance.findOne({ className }).sort({ date: -1 });
    }

    if (!session) {
      return res.json({
        className,
        date: date || null,
        total: 0,
        present: 0,
        absent: 0,
        records: [],
      });
    }

    const records = session.records.map((r, i) => ({
      id: i + 1,                 // SI No (for table)
      name: r.studentName,
      enrollNo: r.enrollNo,      // keep camelCase to match saved payloads
      status: r.status,
    }));

    const present = session.records.filter(r => r.status === "Present").length;
    const absent = session.records.length - present;

    return res.json({
      className: session.className,
      date: session.date,
      total: session.records.length,
      present,
      absent,
      records,
    });
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    res.status(500).json({ message: "Server error" });
  }
};

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
