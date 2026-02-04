// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const dotenv = require("dotenv");

const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

dotenv.config();

/* =========================
   HELPERS
========================= */

// Decide frontend URL (localhost vs production)
const getFrontendUrl = (req) => {
  const origin = req.headers.origin || "";

  if (origin.includes("localhost")) {
    return process.env.FRONTEND_URL_LOCAL || "http://localhost:3000";
  }

  return process.env.FRONTEND_URL_PROD || "https://class-craft-gayatri.netlify.app";
};

/* =========================
   REGISTER
   POST /api/auth/register
========================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // ❗ password hashing handled by User model pre-save hook
    const user = new User({
      name,
      email: normalizedEmail,
      password,
      role: role || "student",
    });

    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

/* =========================
   LOGIN
   POST /api/auth/login
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ message: "JWT secret not configured" });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (role && user.role !== role) {
      return res.status(403).json({ message: "Role mismatch" });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

/* =========================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
========================= */
router.post("/forgot-password", async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // 🔒 prevent email enumeration
      return res.json({
        message: "If the email exists, a reset link has been sent",
      });
    }

    // generate token (method must exist in User model)
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = getFrontendUrl(req);
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
console.log("RESET TOKEN (DEV ONLY):", resetToken);

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text:
        `You requested a password reset.\n\n` +
        `Click the link below (valid for 15 minutes):\n` +
        `${resetUrl}\n\n` +
        `If you did not request this, please ignore this email.`,
    });

    res.json({
      message: "If the email exists, a reset link has been sent",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================
   RESET PASSWORD
   PUT /api/auth/reset-password/:token
========================= */
router.put("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    user.password = password; // 🔐 hashed by pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
