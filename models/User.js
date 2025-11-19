// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
  avatarUrl: { type: String, default: "/Avatar.jpg" },
  preferences: {
    notifications: { type: Boolean, default: true },
    theme: { type: String, default: "light" },
    language: { type: String, default: "English" },
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
