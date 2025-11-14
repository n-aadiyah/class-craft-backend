// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET || "change_this";

exports.authMiddleware = (req, res, next) => {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "No token" });
    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, secret);
    // payload expected to carry { id, role, name, email }
    req.user = {
      id: payload.id,
      role: payload.role,
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
