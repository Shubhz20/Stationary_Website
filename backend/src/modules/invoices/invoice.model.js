const mongoose = require('mongoose');

const invoiceLineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    sku: { type: String, required: true },
    hsnCode: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    cgst: { type: Number, required: true, min: 0 },
    sgst: { type: Number, required: true, min: 0 },
    igst: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    seller: {
      name: { type: String, required: true },
      gstin: { type: String, required: true },
      address: { type: String, required: true },
    },
    buyer: {
      name: { type: String, required: true },
      companyName: { type: String, required: true },
      gstin: { type: String, default: null },
      address: { type: String, required: true },
    },
    lineItems: {
      type: [invoiceLineItemSchema],
      required: true,
    },
    subtotal: { type: Number, required: true, min: 0 },
    totalCgst: { type: Number, required: true, min: 0 },
    totalSgst: { type: Number, required: true, min: 0 },
    totalIgst: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountInWords: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'partial'],
      required: true,
    },
    dueDate: { type: Date, default: null },
    pdfPath: { type: String, default: null },
    issuedAt: { type: Date, default: Date.now },
    financialYear: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
