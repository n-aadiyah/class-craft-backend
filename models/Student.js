const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
       // one user = one student
    },
    name: { type: String, required: true },
enrollNo: { type: String, required: true },
    contact: { type: String, required: true },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    // optional but used by dashboard
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
  },
  { timestamps: true }
);
studentSchema.index(
  { classId: 1, enrollNo: 1 },
  { unique: true }
);


module.exports = mongoose.model("Student", studentSchema);
