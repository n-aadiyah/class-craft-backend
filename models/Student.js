const mongoose = require("mongoose"); 
const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ✅ one user = one student forever
    },
    name: { type: String, required: true },
    enrollNo: { type: String, required: true },
    contact: { type: String, required: true },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// ❌ NO compound index needed
// ❌ NO unique enrollNo globally
// ❌ NO classId+enrollNo uniqueness

module.exports = mongoose.model("Student", studentSchema);
