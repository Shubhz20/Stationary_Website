/**
 * Custom application error class.
 *
 * Throw these in services/controllers — the error middleware catches them
 * and maps to the correct HTTP response.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code (e.g., 'INSUFFICIENT_STOCK')
   * @param {*} details - Optional additional details (field errors, limits, etc.)
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes expected errors from bugs

    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory methods for common errors ──

  static badRequest(message, details = null) {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Insufficient permissions') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource') {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static conflict(message, code = 'DUPLICATE_RESOURCE') {
    return new AppError(message, 409, code);
  }

  static businessLogic(message, code, details = null) {
    return new AppError(message, 422, code, details);
  }
}

module.exports = AppError;
