const winston = require('winston');
const path = require('path');

// Don't import config here to avoid circular dependency.
// Read LOG_LEVEL directly; config validates it anyway.
const level = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const formats = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
];

// Dev: colorized console. Prod: JSON for log aggregators.
const devFormat = winston.format.combine(
  ...formats,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${stack || message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(...formats, winston.format.json());

const transports = [
  new winston.transports.Console({
    format: isProduction ? prodFormat : devFormat,
  }),
];

// In production, also log to files
if (isProduction) {
  const logDir = path.resolve('logs');
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

const logger = winston.createLogger({
  level,
  transports,
  // Don't exit on uncaught errors handled by winston
  exitOnError: false,
});

module.exports = logger;
