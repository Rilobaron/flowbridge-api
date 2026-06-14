export function errorMiddleware(error, req, res, next) {
  console.error("Unhandled error:", error);

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });
}