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
const skillRoutes = require('./routes/v1/skills');
const userSkillRoutes = require('./routes/v1/userSkills');
const inquiryRoutes = require('./routes/v1/inquiries');


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
app.use("/api/v1/skills", skillRoutes);
app.use('/api/v1/userSkills', userSkillRoutes);
app.use('/api/v1/inquiries', inquiryRoutes);
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
