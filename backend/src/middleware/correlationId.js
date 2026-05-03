/**
 * Correlation ID middleware — assigns a unique request ID to every
 * incoming request for distributed tracing / log correlation.
 *
 * Checks for X-Request-Id header (set by load balancer or API gateway)
 * and falls back to a crypto-generated UUID.
 */
const { randomUUID } = require('crypto');

function correlationId(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = correlationId;
