// routes/v1/inquiries.js
const express = require("express");
const router = express.Router();
const { query } = require("../../config/db");
const { body, validationResult } = require("express-validator");
const authenticateToken = require("../../middleware/autonticateToken");
const authorizeRole = require("../../middleware/authorizeToken");
const authorizeOwnership = require("../../middleware/authorizeOwnership"); // Reusing for inquiry receiver

// Helper for validation errors
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

// --- POST /api/v1/inquiries --- (Authenticated: Send an inquiry)
router.post(
  "/",
  authenticateToken,
  [
    body("receiver_id")
      .notEmpty()
      .withMessage("Receiver ID is required.")
      .isInt({ min: 1 })
      .withMessage("Receiver ID must be a positive integer."),
    body("subject")
      .trim()
      .notEmpty()
      .withMessage("Subject is required.")
      .isLength({ max: 255 })
      .withMessage("Subject cannot be longer than 255 characters."),
    body("message")
      .trim()
      .notEmpty()
      .withMessage("Message content is required."),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    const senderId = req.user.userId;
    const { receiver_id, subject, message } = req.body;

    if (senderId === receiver_id) {
      const badRequestError = new Error("Cannot send an inquiry to yourself.");
      badRequestError.statusCode = 400;
      return next(badRequestError);
    }

    try {
      // Check if receiver_id exists
      const receiverExists = await query("SELECT id FROM users WHERE id = $1", [
        receiver_id,
      ]);
      if (receiverExists.rows.length === 0) {
        const notFoundError = new Error("Receiver user not found.");
        notFoundError.statusCode = 400; // Client-side error for invalid input
        return next(notFoundError);
      }

      const newInquiry = await query(
        "INSERT INTO inquiries (sender_id, receiver_id, subject, message) VALUES ($1, $2, $3, $4) RETURNING *",
        [senderId, receiver_id, subject, message],
      );

      res.status(201).json({
        message: "Inquiry sent successfully.",
        inquiry: newInquiry.rows[0],
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- GET /api/v1/inquiries/received --- (Authenticated: Get all inquiries received by the current user)
router.get("/received", authenticateToken, async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const receivedInquiries = await query(
      `SELECT i.id, i.sender_id, u.username as sender_username, i.subject, i.message, i.read_status, i.sent_at
       FROM inquiries i
       JOIN users u ON i.sender_id = u.id
       WHERE i.receiver_id = $1
       ORDER BY i.sent_at DESC`,
      [userId],
    );
    res.json(receivedInquiries.rows);
  } catch (error) {
    next(error);
  }
});

// --- GET /api/v1/inquiries/sent --- (Authenticated: Get all inquiries sent by the current user)
router.get("/sent", authenticateToken, async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const sentInquiries = await query(
      `SELECT i.id, i.receiver_id, u.username as receiver_username, i.subject, i.message, i.read_status, i.sent_at
       FROM inquiries i
       JOIN users u ON i.receiver_id = u.id
       WHERE i.sender_id = $1
       ORDER BY i.sent_at DESC`,
      [userId],
    );
    res.json(sentInquiries.rows);
  } catch (error) {
    next(error);
  }
});

// --- GET /api/v1/inquiries/:id --- (Authenticated, Owner/Admin: Get a specific inquiry)
// Owner is defined as the 'receiver_id'
router.get(
  "/:id",
  authenticateToken,
  authorizeOwnership("inquiries", "receiver_id", "id"),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const inquiry = await query(
        `SELECT i.id, i.sender_id, su.username as sender_username, i.receiver_id, ru.username as receiver_username, i.subject, i.message, i.read_status, i.sent_at
       FROM inquiries i
       LEFT JOIN users su ON i.sender_id = su.id
       LEFT JOIN users ru ON i.receiver_id = ru.id
       WHERE i.id = $1`,
        [id],
      );
      if (inquiry.rows.length === 0) {
        const notFoundError = new Error("Inquiry not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.json(inquiry.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

// --- PUT /api/v1/inquiries/:id/read-status --- (Authenticated, Owner/Admin: Mark inquiry as read/unread)
router.put(
  "/:id/read-status",
  authenticateToken,
  authorizeOwnership("inquiries", "receiver_id", "id"),
  [
    body("read_status")
      .notEmpty()
      .withMessage("Read status is required.")
      .isBoolean()
      .withMessage("Read status must be a boolean (true/false)."),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    const { id } = req.params;
    const { read_status } = req.body;
    try {
      const updatedInquiry = await query(
        "UPDATE inquiries SET read_status = $1 WHERE id = $2 RETURNING *",
        [read_status, id],
      );
      if (updatedInquiry.rows.length === 0) {
        const notFoundError = new Error("Inquiry not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.json({
        message: "Inquiry read status updated.",
        inquiry: updatedInquiry.rows[0],
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- DELETE /api/v1/inquiries/:id --- (Authenticated, Owner/Admin: Delete an inquiry)
// Owner is defined as the 'receiver_id'
router.delete(
  "/:id",
  authenticateToken,
  authorizeOwnership("inquiries", "receiver_id", "id"),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const deletedInquiry = await query(
        "DELETE FROM inquiries WHERE id = $1 RETURNING id",
        [id],
      );
      if (deletedInquiry.rows.length === 0) {
        const notFoundError = new Error("Inquiry not found.");
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// --- ADMIN ONLY: GET /api/v1/inquiries --- (Admin Only: Get all inquiries)
router.get(
  "/",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res, next) => {
    try {
      const allInquiries = await query(
        `SELECT i.id, i.sender_id, su.username as sender_username, i.receiver_id, ru.username as receiver_username, i.subject, i.message, i.read_status, i.sent_at
       FROM inquiries i
       LEFT JOIN users su ON i.sender_id = su.id
       LEFT JOIN users ru ON i.receiver_id = ru.id
       ORDER BY i.sent_at DESC`,
      );
      res.json(allInquiries.rows);
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
