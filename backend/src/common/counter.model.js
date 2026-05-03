const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

/**
 * Atomically increment and return the next sequence value.
 * Thread-safe under concurrency via findOneAndUpdate + $inc.
 *
 * @param {string} counterName - e.g., "orderNumber-2026", "invoiceNumber-2025-26"
 * @returns {Promise<number>} Next sequential number (1, 2, 3, ...)
 */
counterSchema.statics.getNext = async function (counterName) {
  const result = await this.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
