// server.js
require("dotenv").config();
const express = require("express");
// const helmet = require("helmet");
const cors = require("cors");
// const morgan = require("morgan");
const { globalLimiter } = require("./middleware/rateLimitters"); // adjust path if needed
const errorHandler = require("./middleware/errorHandler");
const { pool } = require("./config/db");

// Routes
const authRoutes = require("./routes/v1/auth");
const usersRoutes = require("./routes/v1/users");

const app = express();

// Basic middleware
// app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(morgan("dev"));

// Apply global rate limiter
app.use(globalLimiter);

// Health check
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: "DB connection failed" });
  }
});

// Mount API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", usersRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
