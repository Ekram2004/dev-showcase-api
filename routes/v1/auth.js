const express = require("express");
const router = express.Router();
const { query } = require("../../config/db");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { generateRefreshToken } = require("../../utils/tokenUtils");
const ms = require("ms");

const handleValidationErrors = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationError = new Error("Validation failed");
    validationError.statusCode = 400;
    validationError.isValidationError = true;
    validationError.errors = errors.array();
    return next(validationError);
  }
  next();
};

router.post(
  "/register",
  [
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username is required")
      .isLength({ min: 3, max: 50 })
      .withMessage("Username must be between 3 and 50 characters"),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email must be a valid email address"),
    body("password")
      .notEmpty()
      .withMessage("Password required")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 charcters"),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { username, email, password } = req.body;
    try {
      const existsingUser = await query(
        "SELECT id FROM users WHERE username = $1 OR email = $2",
        [username, email],
      );
      if (existsingUser.rows.length > 0) {
        const conflictError = new Error("User or Email are already exists");
        conflictError.statusCode = 409;
        return next(conflictError);
      }
      const hashPassword = await bcrypt.hash(password, 10);
      const roleResult = await query("SELECT id FROM roles WHERE name = $1", [
        "user",
      ]);
      if (roleResult.rows[0].length === 0) {
        const serverError = new Error(
          "Internal server error or roles not found",
        );
        serverError.statusCode = 500;
        return next(serverError);
      }
      const userRoleId = roleResult.rows[0].id;

      const newUser = await query(
        "INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id, username, email, created_at",
        [username, email, hashPassword, userRoleId],
      );

      res
        .status(201)
        .json({
          message: "User registered successfully",
          user: newUser.rows[0],
        });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/login",
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("email is required")
      .isEmail()
      .withMessage("email must be a valid email address"),
    body("password").notEmpty().withMessage("password is required"),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { email, password } = req.body;
    try {
      const userResult = await query(
        "SELECT u.id, u.username, u.email,u.password_hash, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1",
        [email],
      );

      const user = userResult.rows[0];
      if (!user) {
        const authError = new Error("Invalid creadential ");
        authError.statusCode = 401;
        return next(authError);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        const authError = new Error("Invalid creadential");
        authError.statusCode = 401;
        return next(authError);
      }
      const accessTokenPayload = {
        userId: user.id,
        username: user.username,
        roles: [user.role_name],
      };
      const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      const refreshToken = generateRefreshToken();
      const refreshExpiresAt = new Date(Date.now() + ms("1h"));

      await query(
        "INSERT INTO refresh_tokens(token, user_id, expires_at)VALUES($1, $2, $3)",
        [refreshToken, user.id, refreshExpiresAt],
      );

      res.json({
        message: "Login successfully",
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: { id: user.id, username: user.username, role: user.role_name },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/refresh-token",
  [
    body("refreshToken")
      .trim()
      .notEmpty()
      .withMessage("Refresh token is required."),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { refreshToken } = req.body;
    try {
      const existingRefreshToken = await query(
        "SELECT rt.*, u.username , r.name as role_name FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id JOIN roles r ON u.role_id = r.id WHERE rt.token = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()",
        [refreshToken],
      );
      const tokenData = existingRefreshToken.rows[0];

      if (!tokenData) {
        const authError = new Error("Invalid or expired refresh token.");
        authError.statusCode = 403;
        return next(authError);
      }

      const newAccessTokenPayload = {
        userId: tokenData.user_id,
        username: tokenData.username,
        roles: [tokenData.role_name],
      };

      const newAccessToken = jwt.sign(
        newAccessTokenPayload,
        process.env.JWT_SECRET,
        { expiresIn: "1h" },
      );

      res.json({
        message: "New access token issued.",
        accessToken: newAccessToken,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/logout",
  [
    body("refreshToken")
      .trim()
      .notEmpty()
      .withMessage("Refresh token is required logout."),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { refreshToken } = req.body;

    try {
      const result = await query(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1 RETURNING id",
        [refreshToken],
      );

      if (result.rows.length === 0) {
        console.warn(
          "Logout : Refresh token not found or already revoked:",
          refreshToken,
        );
      }

      res
        .status(200)
        .json({ message: "Logged out successfully. Token revoked." });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
