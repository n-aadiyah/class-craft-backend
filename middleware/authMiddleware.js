const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET || "change_this";

exports.authMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token" });
    }

    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, secret);

    if (!payload || !payload.role) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const uid = payload.id || payload._id || payload.userId;
    if (!uid) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.user = {
      id: uid,
      _id: uid,
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
