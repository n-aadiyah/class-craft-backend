// models/User.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
    },

    avatarUrl: {
      type: String,
      default: "/Avatar.jpg",
    },

    preferences: {
      avatarUrl: { type: String, default: "/Avatar.jpg" },
      notifications: { type: Boolean, default: true },
      theme: { type: String, default: "light" },
      language: { type: String, default: "English" },
    },

    // 🔐 Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

/* 🔒 HASH PASSWORD BEFORE SAVE */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* 🔑 GENERATE RESET TOKEN */
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 min

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);
