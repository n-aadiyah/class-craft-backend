const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const path = require("path");

// Load environment variables
dotenv.config();

const app = express();

/* =========================
   CORS CONFIG (Clean + Safe)
========================= */
const allowedOrigins = [
  "http://localhost:3000",
  "https://class-craft-gayatri.netlify.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

/* =========================
   STATIC FILES
========================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   DATABASE CONNECTION
========================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

/* =========================
   BASIC TEST ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("ClassCraft backend is running 🚀");
});

/* =========================
   ROUTES
========================= */
const authRoutes = require("./routes/auth");
const attendanceRoutes = require("./routes/attendanceRoutes");
const classRoutes = require("./routes/classRoutes");
const studentRoutes = require("./routes/studentRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const questRoutes = require("./routes/questRoutes");
const rewardRoutes = require("./routes/rewardRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/students", studentRoutes); // ⚠️ fixed capital S to lowercase
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/quests", questRoutes);
app.use("/api/rewards", rewardRoutes);

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);