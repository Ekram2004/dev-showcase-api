const express = require("express");
const router = express.Router();
const { query } = require("../../config/db");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const authenticateToken = require("../../middleware/autonticateToken");
const authorizeRole = require("../../middleware/authorizeToken");
const authorizeOwnership = require("../../middleware/authorizeOwnership");

const handleValidationErrors = (req, res, next) => {
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

router.get(
  "/",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res, next) => {
    try {
      const allUsers = await query(
        "SELECT u.id, u.username, u.email, u.bio, u.github_url, linkedin_url, u.portfolio_url, u.profile_picture_url, r.name as role FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC",
      );
      res.json(allUsers.rows);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    const user = await query(
      "SELECT u.id, u.username, u.email, u.bio, u.github_url, u.linkedin_url, u.portfolio_url, u.profile_picture_url, r.name as role_name, u.created_at, u.updated_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
      [id],
    );
    if (user.rows.length === 0) {
      const notFoundError = new Error("User not found.");
      notFoundError.statusCode = 404;
      return next(notFoundError);
    }
    res.json(user.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id",
  authenticateToken,
  authorizeOwnership("users", "id", "id"),
  [
    body("username")
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("Username must be between 3 and 50 characters."),
    body("email")
      .optional()
      .trim()
      .isEmail()
      .withMessage("Must be a valid email address."),
    body("password")
      .optional()
      .notEmpty()
      .withMessage("Password cannot be empty if provided.")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long."),
    body("bio")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Bio cannot be longer than 500 characters."),
    body("github_url").optional().isURL().withMessage("Must be a valid URL."),
    body("linkedin_url").optional().isURL().withMessage("Must be a valid URL."),
    body("portfolio_url")
      .optional()
      .isURL()
      .withMessage("Must be a valid URL."),
    body("profile_picture_url")
      .optional()
      .isURL()
      .withMessage("Must be a valid URL."),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { id } = req.params;
    const {
      username,
      email,
      password,
      bio,
      github_url,
      linkedin_url,
      portfolio_url,
      profile_picture_url,
    } = req.body;
    try {
      const fields = [];
      const params = [id];

      let paramIndex = 2;

      if (username !== undefined) {
        const existingUser = await query(
          "SELECT id FROM users WHERE username = $1 AND id != $2",
          [username, id],
        );
        if (existingUser.rows.length > 0) {
          const conflictError = new Error("Username already taken.");
          conflictError.statusCode = 409;
          return next(conflictError);
        }
        fields.push(`username = $${paramIndex}`);
        params.push(username);
      }
      if (email !== undefined) {
        const existingUser = await query(
          "SELECT id FROM users WHERE email = $1, AND id !=$2",
          [email, id],
        );
        if (existingUser.rows.length > 0) {
          const conflictError = new Error("Username already taken.");
          conflictError.statusCode = 409;
          return next(conflictError);
        }
      }
      if (password !== undefined && password !== "") {
        const passwordHash = await bcrypt.hash(password, 10);
        fields.push(`password_hash = $${paramIndex++}`);
        params.push(passwordHash);
      }
      if (bio !== undefined) {
        fields.push(`bio = $${paramIndex++}`);
        params.push(bio);
      }
      if (github_url !== undefined) {
        fields.push(`github_url = $${paramIndex++}`);
        params.push(github_url);
      }
      if (linkedin_url !== undefined) {
        fields.push(`linkedin_url = $${paramIndex++}`);
        params.push(linkedin_url);
      }
      if (portfolio_url !== undefined) {
        fields.push(`portfolio_url = $${paramIndex++}`);
        params.push(portfolio_url);
      }
      if (profile_picture_url !== undefined) {
        fields.push(`profile_picture_url = $${paramIndex++}`);
        params.push(profile_picture_url);
      }
      if (fields.length === 0) {
        // No fields to update, return current user data
        const currentRes = await query(
          "SELECT u.id, u.username, u.email, u.bio, u.github_url, u.linkedin_url, u.portfolio_url, u.profile_picture_url, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
          [id],
        );
        return res.json(currentRes.rows[0]);
      }
      const setClause = fields.join(", ");
      const updatedUser = await query(
        `UPDATE users SET ${setClause} WHERE id = $1 RETURNING u.id, u.username, u.email, u.bio, u.github_url, u.linkedin_url, u.portfolio_url, u.profile_picture_url, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`, // Note: This RETURNING statement is simplified for a direct 'users' table update. For JOINs, a subquery or second select is often clearer.
        params,
      );
      // Simpler return: Fetch the updated user fully again. Or carefully construct the return data.
      const fetchedUpdatedUser = await query(
        "SELECT u.id, u.username, u.email, u.bio, u.github_url, u.linkedin_url, u.portfolio_url, u.profile_picture_url, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [id],
      );

      res.json(fetchedUpdatedUser.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeOwnership("users", "id", "id"),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const deletedUser = await query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id],
      );
      if (deletedUser.rows.length === 0) {
        const notFoundError = new Error("User not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      next(error);
    }
  },
);

// --- PUT /api/v1/users/:id/role --- (Admin Only: Update user role)
router.put(
  "/:id/role",
  authenticateToken,
  authorizeRole(["admin"]),
  [
    body("roleName")
      .trim()
      .notEmpty()
      .withMessage("Role name is required.")
      .isIn(["user", "admin"])
      .withMessage("Invalid role name."),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const { id } = req.params;
    const { roleName } = req.body;

    try {
      const roleResult = await query("SELECT id FROM roles WHERE name = $1", [
        roleName,
      ]);
      if (roleResult.rows.length === 0) {
        const notFoundError = new Error("Role not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      const roleId = roleResult.rows[0].id;

      const updatedUser = await query(
        "UPDATE users SET role_id = $1 WHERE id = $2 RETURNING id, username, email",
        [roleId, id],
      );

      if (updatedUser.rows.length === 0) {
        const notFoundError = new Error("User not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }

      res.json({
        message: `User ${updatedUser.rows[0].username} role updated to ${roleName}.`,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
