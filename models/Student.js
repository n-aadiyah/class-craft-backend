const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    enrollNo: { type: String, required: true, unique: true },
    contact: { type: String, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Student", studentSchema);
