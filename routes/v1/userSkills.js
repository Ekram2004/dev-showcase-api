const express = require("express");
const router = express.Router();
const { query } = require("../../config/db");
const { body, param, validationResult } = require("express-validator");
const authenticateToken = require("../../middleware/autonticateToken");

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

const validateProficiency = body("proficiency_level")
  .optional()
  .isIn("beginner", "intermediate", "expert")
  .withMessage(
    'Proficiency level must be "beginner", "intermediate", or "expert"',
  );

router.get("/:userId", async (req, res, next) => {
  const { userId } = req.params;
  try {
    const userSkills = await query(
      `SELECT us.user_id, us.skill_id, s.name AS skill_name, us.proficiency_level
       FROM user_skills us
       JOIN skills s ON us.skill_id = s.id
       WHERE us.user_id = $1
       ORDER BY s.name ASC`,
      [userId],
    );
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  authenticateToken,
  [
    body("skill_id")
      .notEmpty()
      .withMessage("Skill ID is required.")
      .isInt({ min: 1 })
      .withMessage("Skill ID must be a positive integer."),
    validateProficiency,
    handleValidationErrors,
  ],
  async (req, res, next) => {
    const userId = req.user.userId;
    const { skill_id, proficiency_level } = req.body;

    try {
      const skillExists = await query("SELECT id FROM skills WHERE id = $1", [
        skill_id,
      ]);

      if (skillExists.rows.length === 0) {
        const notFoundError = new Error("Provided skill ID does not exist.");
        notFoundError.statusCode = 400;
        return next(notFoundError);
      }
      const existingUserSkill = await query(
        "SELECT user_id FROM user_skills WHERE user_id = $1 AND skill_id = $2",
        [userId, skill_id],
      );
      if (existingUserSkill.rows.length > 0) {
        const conflictError = new Error("User already has this skill.");
        conflictError.statusCode = 409;
        return next(conflictError);
      }
      const newUserSkill = await query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency_level)VALUES($1, $2, $3) RETURNING user_id, skill_id, proficiency_level`,
        [userId, skill_id, proficiency_level || "intermediate"],
      );
      res.status(201).json(newUserSkill.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:skillId",
  authenticateToken,
  [
    body("skillId")
      .notEmpty()
      .withMessage("Skill ID in URL is required.")
      .isInt({ min: 1 })
      .withMessage("Skill ID in URL must be a positive integer."),
    validateProficiency,
    handleValidationErrors,
  ],
  async (req, res, next) => {
    const userId = req.user.userId;
    const { skillId } = req.params;
    const { proficiency_level } = req.body;
    if (!proficiency_level) {
      const badRequestError = new Error(
        "Proficiency level is required for update.",
      );
      badRequestError.statusCode = 400;
      return next(badRequestError);
    }
    try {
      const updatedUserSkill = await query(
        "UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3 RETURNING user_id, skill_id, proficiency_level",
        [proficiency_level, userId, skillId],
      );
      if (updatedUserSkill.rows.length === 0) {
        const notFoundError = new Error(
          "User skill not found or not owned by user.",
        );
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.json(updatedUserSkill.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:skillId",
  authenticateToken,
  [
    param("skillId")
      .notEmpty()
      .withMessage("Skill ID in URL is required.")
      .isInt({ min: 1 })
      .withMessage("Skill ID in URL must be a positive integer."),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const userId = req.user.userId;
    const { skillId } = req.params;
    try {
      const deletedUserSkill = await query(
        "DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2 RETURNING user_id",
        [userId, skillId],
      );
      if (deletedUserSkill.rows.length === 0) {
        const notFoundError = new Error(
          "User skill not found or not owned by user.",
        );
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
