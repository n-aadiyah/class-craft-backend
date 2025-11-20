// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const dotenv = require("dotenv");

dotenv.config();

// ✅ REGISTER - POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check for missing fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Password length check
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: role || "student", // Default role
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// routes/auth.js — robust debug login handler
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // require only email + password
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET missing in .env");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // fetch user including the password (schema has select: false)
    const user = await User.findOne({ email: String(email).toLowerCase() }).select("+password");

    console.log("DEBUG login: user fetched:", !!user, user ? { id: user._id, role: user.role } : null);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // show actual stored password shape for debugging (truncate for safety)
    const stored = user.password;
    console.log("DEBUG login: typeof stored password:", typeof stored);
    if (stored && typeof stored === "string") {
      console.log("DEBUG login: stored hash (start):", stored.slice(0, 10));
    } else {
      console.log("DEBUG login: stored password value is falsy or not string:", stored);
    }

    // optional: role match check
    if (role && user.role !== role) {
      return res.status(403).json({ message: "Role mismatch" });
    }

    // Defensive: if stored hash is missing or not a string -> error
    if (!stored || typeof stored !== "string") {
      console.error("Login error: user.password missing or malformed for user:", user._id);
      return res.status(500).json({ message: "Server misconfiguration: user password missing or malformed" });
    }

    // Use synchronous compare to avoid callback/promise mismatch across bcrypt libraries
    let isMatch = false;
    try {
      isMatch = bcrypt.compareSync(password, stored);
    } catch (cmpErr) {
      console.error("bcrypt.compareSync error:", cmpErr && cmpErr.stack ? cmpErr.stack : cmpErr);
      return res.status(500).json({ message: "Server error verifying password", error: String(cmpErr) });
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.status(200).json({
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
  } catch (error) {
    console.error("Login Error (catch):", error && error.stack ? error.stack : error);
    return res.status(500).json({ message: "Server error during login", error: error.message || String(error) });
  }
});


module.exports = router;
