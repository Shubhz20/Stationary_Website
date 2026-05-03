const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Initialize Socket.io server on the HTTP server.
 * Returns a SocketEmitter helper for use in services.
 */
function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.client.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // ── Authentication middleware ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ──
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const role = socket.userRole;

    logger.debug(`Socket connected: ${userId} (${role})`);

    // Auto-join user's personal room
    socket.join(`user:${userId}`);

    // Admins join admin room
    if (role === 'admin') {
      socket.join('admin');
    }

    // ── Client events ──
    socket.on('join:order', ({ orderId }) => {
      if (orderId) {
        socket.join(`order:${orderId}`);
        logger.debug(`User ${userId} joined order:${orderId}`);
      }
    });

    socket.on('leave:order', ({ orderId }) => {
      if (orderId) {
        socket.leave(`order:${orderId}`);
      }
    });

    // ── Delivery partner: live location via socket ──
    socket.on('delivery:updateLocation', ({ deliveryId, coordinates }) => {
      // Re-broadcast to the order room
      // (The REST endpoint handles DB persistence; this is for real-time push)
      if (deliveryId && coordinates) {
        socket.to(`order:${deliveryId}`).emit('delivery:location', {
          deliveryId,
          coordinates,
          timestamp: new Date(),
        });
      }
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${userId}`);
    });
  });

  // ── Emitter helper (used by services via req.app.get('socketEmitter')) ──
  const emitter = new SocketEmitter(io);

  return { io, emitter };
}

/**
 * Helper class for emitting events from services.
 * Abstracts room targeting.
 */
class SocketEmitter {
  constructor(io) {
    this.io = io;
  }

  /** Emit to a specific user's room */
  toUser(userId) {
    return this.io.to(`user:${userId}`);
  }

  /** Emit to an order's tracking room */
  toOrder(orderId) {
    return this.io.to(`order:${orderId}`);
  }

  /** Emit to a named room (e.g., 'admin') */
  toRoom(room) {
    return this.io.to(room);
  }

  /** Broadcast to all connected clients */
  broadcast() {
    return this.io;
  }
}

module.exports = { initializeSocket };
