export function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  const payload = {
    message: err.message || "Server error"
  };

  if (err.details !== undefined) {
    if (err.details && typeof err.details === "object") {
      Object.assign(payload, err.details);
    } else {
      payload.details = err.details;
    }
  } else if (process.env.NODE_ENV !== "production") {
    payload.details = err.stack;
  }

  res.status(statusCode).json(payload);
}
