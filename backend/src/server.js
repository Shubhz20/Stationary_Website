const http = require('http');
const config = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/database');
const createApp = require('./app');
const { initializeSocket } = require('./sockets');

async function startServer() {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create Express app
  const app = createApp();

  // 3. Create HTTP server
  const server = http.createServer(app);

  // 4. Initialize Socket.io
  const { emitter } = initializeSocket(server);
  app.set('socketEmitter', emitter); // accessible via req.app.get('socketEmitter')

  // 5. Start listening
  server.listen(config.port, () => {
    logger.info(`
╔══════════════════════════════════════════════╗
║  Stationery Platform API                     ║
║  Environment: ${config.env.padEnd(30)}║
║  Port: ${String(config.port).padEnd(37)}║
║  MongoDB: connected                          ║
║  Socket.io: ready                            ║
╚══════════════════════════════════════════════╝
    `);
  });

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error during shutdown:', err);
      }
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Unhandled errors ──
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });
}

startServer();
