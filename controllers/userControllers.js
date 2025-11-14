// controllers/usercontrollers.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const secret = process.env.JWT_SECRET || "change_this";
const TOKEN_EXPIRES = "8h";

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "email and password required" });

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // if you stored plain passwords (not recommended), replace this with a direct compare (but migrate to hashed soon).
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name, email: user.email },
      secret,
      { expiresIn: TOKEN_EXPIRES }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, role: user.role, email: user.email },
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
