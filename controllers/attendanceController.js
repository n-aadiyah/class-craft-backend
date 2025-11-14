// controllers/attendanceController.js
const Attendance = require("../models/Attendance");
const Class = require("../models/Class");
const Student = require("../models/Student");
const mongoose = require("mongoose");

/* ---------- helpers: normalize to UTC day boundaries ---------- */
function startOfUTC(dateLike) {
  const d = new Date(dateLike || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/* ---------- helper: ensure teacher owns the class (or user is admin) ---------- */
async function ensureAccessToClassByName(className, user) {
  const cls = await Class.findOne({ name: className }).select("teacher name").lean();
  if (!cls) {
    const e = new Error("Class not found");
    e.status = 404;
    throw e;
  }
  if (user && user.role === "teacher" && String(cls.teacher) !== String(user.id)) {
    const e = new Error("Forbidden: not owner of this class");
    e.status = 403;
    throw e;
  }
  return cls;
}

async function ensureAccessToClassById(classId, user) {
  const cls = await Class.findById(classId).select("teacher name").lean();
  if (!cls) {
    const e = new Error("Class not found");
    e.status = 404;
    throw e;
  }
  if (user && user.role === "teacher" && String(cls.teacher) !== String(user.id)) {
    const e = new Error("Forbidden: not owner of this class");
    e.status = 403;
    throw e;
  }
  return cls;
}

/* ================================================================
   GET /api/attendance/history?className=...&date=YYYY-MM-DD
   - Requires auth (req.user)
   - Teachers see only their classes; admins see any
================================================================= */
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { className, date } = req.query;
    const user = req.user; // authMiddleware must have set this

    if (!className) {
      return res.status(400).json({ message: "className query param is required" });
    }

    // authorize
    await ensureAccessToClassByName(className, user);

    let session;
    if (date) {
      const dayStartUTC = startOfUTC(date);
      session = await Attendance.findOne({ className, dateOnlyUTC: dayStartUTC }).lean();
    } else {
      session = await Attendance.findOne({ className }).sort({ dateOnlyUTC: -1 }).lean();
    }

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
      id: i + 1,
      studentId: r.studentId,
      name: r.studentName,
      enrollNo: r.enrollNo,
      status: r.status,
    }));

    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;

    return res.json({
      className: session.className,
      date: session.date,
      total: records.length,
      present,
      absent,
      records,
    });
  } catch (err) {
    console.error("getAttendanceHistory error:", err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Server error" });
  }
};

/* ================================================================
   POST /api/attendance/save
   body: { className, date?, records: [{studentId,studentName,enrollNo,status}] }
   - Upsert by (className + UTC day)
   - Teachers may save only for their classes
================================================================= */
exports.saveAttendance = async (req, res) => {
  try {
    const { className, date, records } = req.body;
    const user = req.user;

    if (!className || !Array.isArray(records)) {
      return res.status(400).json({ message: "Missing required fields: className and records (array)" });
    }

    // authorize
    await ensureAccessToClassByName(className, user);

    // validate records contain studentIds and statuses
    for (const r of records) {
      if (!r.studentId || !r.status) {
        return res.status(400).json({ message: "Each record must contain studentId and status" });
      }
      // optional: verify student belongs to the class
      if (!mongoose.Types.ObjectId.isValid(r.studentId)) {
        return res.status(400).json({ message: `Invalid studentId: ${r.studentId}` });
      }
    }

    const dayStartUTC = startOfUTC(date || Date.now());

    // Optionally ensure all studentIds exist and belong to class (recommended)
    const studentIds = records.map(r => r.studentId);
    const students = await Student.find({ _id: { $in: studentIds } }).select("_id classId name enrollNo").lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));
    for (const r of records) {
      const s = studentMap.get(String(r.studentId));
      if (!s) {
        return res.status(400).json({ message: `Student not found: ${r.studentId}` });
      }
      // verify student belongs to the class assigned by name
      const cls = await Class.findOne({ name: className }).select("_id").lean();
      if (!cls || String(s.classId) !== String(cls._id)) {
        return res.status(400).json({ message: `Student ${r.studentId} does not belong to class ${className}` });
      }
    }

    // Upsert: replace/insert attendance doc for the day
    const updated = await Attendance.findOneAndUpdate(
      { className, dateOnlyUTC: dayStartUTC },
      {
        $set: {
          className,
          date: dayStartUTC,
          dateOnlyUTC: dayStartUTC,
          records,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      message: "Attendance saved/updated successfully ✅",
      attendance: updated,
    });
  } catch (err) {
    console.error("saveAttendance error:", err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Server error" });
  }
};

/* ================================================================
   GET /api/attendance/class/:className
   - Returns all sessions for class (newest first)
   - Teacher only if owner; admin can access all
================================================================= */
exports.getAttendanceByClass = async (req, res) => {
  try {
    const { className } = req.params;
    const user = req.user;

    if (!className) return res.status(400).json({ message: "className param required" });

    await ensureAccessToClassByName(className, user);

    const records = await Attendance.find({ className }).sort({ dateOnlyUTC: -1 }).lean();

    res.set("Cache-Control", "no-store");
    return res.json(records);
  } catch (err) {
    console.error("getAttendanceByClass error:", err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Server error" });
  }
};

/* ================================================================
   GET /api/attendance/monthly?className=...&year=YYYY&month=MM
   - Teacher only sees their class; admin can specify any
   - Returns matrix: days + students with daily statuses
================================================================= */
exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { className, year, month } = req.query;
    const user = req.user;

    if (!className || !year || !month) {
      return res.status(400).json({ message: "className, year, and month are required" });
    }

    // authorize class access
    await ensureAccessToClassByName(className, user);

    const y = parseInt(year, 10);
    const m = parseInt(month, 10); // 1..12
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ message: "Invalid year/month" });
    }

    // Month [startUTC, endUTC)
    const startUTC = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const endUTC = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // find class by name to get its _id
    const cls = await Class.findOne({ name: className }).select("_id").lean();
    if (!cls) return res.status(404).json({ message: "Class not found" });

    // load students in that class (alphabetical)
    const students = await Student.find({ classId: cls._id })
      .select("_id name enrollNo")
      .sort({ name: 1 })
      .lean();

    // load attendance sessions for the month
    const sessions = await Attendance.find({
      className,
      dateOnlyUTC: { $gte: startUTC, $lt: endUTC },
    })
      .select("dateOnlyUTC records")
      .lean();

    // build lookup studentId -> { day -> status }
    const perStudentDayStatus = new Map();
    for (const session of sessions) {
      const day = new Date(session.dateOnlyUTC).getUTCDate(); // 1..daysInMonth
      for (const rec of session.records || []) {
        const sid = String(rec.studentId);
        if (!perStudentDayStatus.has(sid)) perStudentDayStatus.set(sid, {});
        perStudentDayStatus.get(sid)[day] = rec.status;
      }
    }

    // compose rows
    const rows = students.map((stu) => {
      const sid = String(stu._id);
      const dayMap = perStudentDayStatus.get(sid) || {};

      const daily = days.map((d) => dayMap[d] || "NA");
      const present = daily.filter(s => s === "Present").length;
      const absent = daily.filter(s => s === "Absent").length;

      return {
        studentId: stu._id,
        name: stu.name,
        enrollNo: stu.enrollNo,
        daily,
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
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Server error" });
  }
};
