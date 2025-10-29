const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

// Basic test route
app.get("/", (req, res) => {
  res.send("ClassCraft backend is running 🚀");
});

// Import routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
