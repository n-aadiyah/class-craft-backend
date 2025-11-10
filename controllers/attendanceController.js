// controllers/attendanceController.js
const Attendance = require("../models/Attendance");
const Class = require("../models/Class");
const Student = require("../models/Student");

/* ---------- helpers: normalize to UTC day boundaries ---------- */
function startOfUTC(dateLike) {
  const d = new Date(dateLike || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function nextDayUTC(d0) {
  const d = new Date(d0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/* ================================================================
   GET /api/attendance/history?className=Grade%208%20-%20A&date=2025-11-10
   - If date is provided: returns that day’s session (if any)
   - Else: returns the latest session for the class
================================================================ */
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { className, date } = req.query;

    if (!className) {
      return res.status(400).json({ message: "className query param is required" });
    }

    let session;

    if (date) {
      // exact day match via normalized UTC day
      const dayStartUTC = startOfUTC(date);
      session = await Attendance.findOne({
        className,
        dateOnlyUTC: dayStartUTC,
      }).lean();
    } else {
      // latest by normalized day
      session = await Attendance.findOne({ className })
        .sort({ dateOnlyUTC: -1 })
        .lean();
    }

    // Avoid caching this response
    res.set("Cache-Control", "no-store");

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

    const records = (session.records || []).map((r, i) => ({
      id: i + 1,                 // SI No (for table)
      name: r.studentName,
      enrollNo: r.enrollNo,
      status: r.status,          // "Present" | "Absent"
    }));

    const present = (session.records || []).filter(r => r.status === "Present").length;
    const absent  = (session.records || []).filter(r => r.status === "Absent").length;

    return res.json({
      className: session.className,
      date: session.date,        // original timestamp (you also have dateOnlyUTC)
      total: (session.records || []).length,
      present,
      absent,
      records,
    });
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================================================
   POST /api/attendance/save
   body: { className, date?, records: [{studentId,studentName,enrollNo,status}] }
   - Upsert by (className + UTC day)
================================================================ */
exports.saveAttendance = async (req, res) => {
  try {
    const { className, date, records } = req.body;

    if (!className || !records) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const dayStartUTC = startOfUTC(date || Date.now());

    // Upsert: one doc per (className, dateOnlyUTC)
    const updated = await Attendance.findOneAndUpdate(
      { className, dateOnlyUTC: dayStartUTC },
      {
        $set: {
          className,
          date: dayStartUTC,       // keep original date field normalized (optional)
          dateOnlyUTC: dayStartUTC,
          records,                 // replace entire set for the day
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(200).json({
      message: "Attendance saved/updated successfully ✅",
      attendance: updated,
    });
  } catch (error) {
    console.error("❌ Error saving attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================================================================
   GET /api/attendance/class/:className
   - All sessions for class, newest first
================================================================ */
exports.getAttendanceByClass = async (req, res) => {
  try {
    const { className } = req.params;
    const records = await Attendance.find({ className })
      .sort({ dateOnlyUTC: -1 })
      .lean();

    res.set("Cache-Control", "no-store");
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Error fetching attendance" });
  }
};

/* ================================================================
   GET /api/attendance/monthly?className=Grade%208%20-%20A&year=2025&month=11
   Returns: {
     className, year, month, days:[1..N],
     students:[{studentId,name,enrollNo,daily:[...],present,absent}]
   }
================================================================ */
exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { className, year, month } = req.query;

    if (!className || !year || !month) {
      return res.status(400).json({ message: "className, year, and month are required" });
    }

    const y = parseInt(year, 10);
    const m = parseInt(month, 10); // 1..12
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ message: "Invalid year/month" });
    }

    // Month range [start, end) by UTC-normalized days
    const startUTC = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const endUTC   = new Date(Date.UTC(y, m,     1, 0, 0, 0, 0));
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // 1) Find class by name (Attendance stores className string)
    const cls = await Class.findOne({ name: className }).lean();
    if (!cls) {
      return res.status(404).json({ message: "Class not found by name" });
    }

    // 2) Load all students for the class (always show everyone)
    const students = await Student.find({ classId: cls._id })
      .select("_id name enrollNo")
      .lean();

    // 3) Load all attendance sessions for that month (using dateOnlyUTC for speed/accuracy)
    const sessions = await Attendance.find({
      className,
      dateOnlyUTC: { $gte: startUTC, $lt: endUTC },
    })
      .select("dateOnlyUTC records")
      .lean();

    // 4) Build lookup: studentId -> { [day]: "Present"/"Absent" }
    const perStudentDayStatus = new Map();
    for (const session of sessions) {
      const day = new Date(session.dateOnlyUTC).getUTCDate(); // 1..daysInMonth
      for (const rec of session.records) {
        const sid = String(rec.studentId);
        if (!perStudentDayStatus.has(sid)) perStudentDayStatus.set(sid, {});
        perStudentDayStatus.get(sid)[day] = rec.status;
      }
    }

    // 5) Compose matrix rows
    const rows = students.map((stu) => {
      const sid = String(stu._id);
      const dayMap = perStudentDayStatus.get(sid) || {};

      // Default to "NA" for not-marked days
      const daily = days.map((d) => dayMap[d] || "NA");

      const present = daily.filter((s) => s === "Present").length;
      const absent  = daily.filter((s) => s === "Absent").length; // "NA" not counted

      return {
        studentId: stu._id,
        name: stu.name,
        enrollNo: stu.enrollNo,
        daily,   // "Present" | "Absent" | "NA"
        present,
        absent,
      };
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      className,
      year: y,
      month: m,
      days,
      students: rows,
    });
  } catch (err) {
    console.error("getMonthlyAttendance error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
