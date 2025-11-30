const rateLimit = require("express-rate-limit");

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try agin after 15 minutes.",
  headers: true,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many requests.",
      detail: "You have exceeded the API rate limit. Please try again later.",
    });
  },
});

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: "Too many requests from this IP , Please try agin after 5 minutes",
  headers: true,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many login attempts",
      detail:
        "You have reached the maximum login attempt please try again after 5 minutes.",
    });
  },
});

module.exports = { loginLimiter, globalLimiter };
