const errorHandler = (err, req, res, next) => {
  console.error("An error occured(REST API):", err.message, err.stack);

  const statusCode = err.statusCode || 500;
  let message = err.message || "Internal Sserver Error";

  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "An unexpected error occured. Please try again later.";
  }

  if (err.isValidationError) {
    return res.status(err.statusCode || 400).json({
      message: "Validation failed",
      errors: err.errors.map((e) => ({ field: e.param, msg: e.msg })),
    });
  }

  res.status(statusCode).json({
    message: message,
    code: err.code,
  });
};

module.exports = errorHandler;
