const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const Invoice = require('./invoice.model');
const Order = require('../orders/order.model');
const Company = require('../auth/company.model');
const User = require('../auth/user.model');
const Counter = require('../../common/counter.model');
const AppError = require('../../common/AppError');
const { amountInWords, getFinancialYear, paisaToRupees } = require('../../common/helpers');
const config = require('../../config/env');
const logger = require('../../config/logger');

// Seller info — would come from config/DB in production
const SELLER_INFO = {
  name: 'StationeryHub Pvt Ltd',
  gstin: '29AABCS1234F1Z5',
  address: '123 Commercial Street, Bangalore, Karnataka 560001',
  state: 'Karnataka',
};

class InvoiceService {
  /**
   * Generate invoice for a confirmed order.
   */
  async generateInvoice(orderId) {
    const order = await Order.findById(orderId).populate('client company');
    if (!order) throw AppError.notFound('Order');

    // Check if invoice already exists
    const existing = await Invoice.findOne({ order: orderId });
    if (existing) return existing;

    const company = order.company;
    const client = order.client;
    const fy = getFinancialYear(order.createdAt);

    // Generate invoice number
    const seq = await Counter.getNext(`invoiceNumber-${fy}`);
    const invoiceNumber = `INV-${fy}-${String(seq).padStart(5, '0')}`;

    // Determine intra/inter-state GST
    const buyerState = order.shippingAddress.state?.toLowerCase();
    const sellerState = SELLER_INFO.state.toLowerCase();
    const isInterState = buyerState !== sellerState;

    // Build line items with GST split
    const lineItems = order.items.map((item) => {
      const gstAmount = item.gstAmount;
      return {
        description: item.productSnapshot.name,
        sku: item.productSnapshot.sku,
        hsnCode: item.productSnapshot.hsnCode,
        quantity: item.quantity,
        unit: item.productSnapshot.unit,
        pricePerUnit: item.pricePerUnit,
        subtotal: item.subtotal,
        gstRate: item.productSnapshot.gstRate,
        cgst: isInterState ? 0 : Math.round(gstAmount / 2),
        sgst: isInterState ? 0 : Math.round(gstAmount / 2),
        igst: isInterState ? gstAmount : 0,
        total: item.total,
      };
    });

    const totalCgst = lineItems.reduce((s, i) => s + i.cgst, 0);
    const totalSgst = lineItems.reduce((s, i) => s + i.sgst, 0);
    const totalIgst = lineItems.reduce((s, i) => s + i.igst, 0);

    // Format buyer address
    const addr = order.shippingAddress;
    const buyerAddress = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode]
      .filter(Boolean)
      .join(', ');

    // Payment status
    let paymentStatus = 'unpaid';
    if (order.paymentMethod === 'razorpay') {
      paymentStatus = 'paid';
    }

    // Due date for credit orders
    let dueDate = null;
    if (order.paymentMethod === 'credit' && company.paymentTermsDays > 0) {
      dueDate = new Date(order.createdAt);
      dueDate.setDate(dueDate.getDate() + company.paymentTermsDays);
    }

    const invoice = await Invoice.create({
      invoiceNumber,
      order: orderId,
      seller: SELLER_INFO,
      buyer: {
        name: client.name,
        companyName: company.name,
        gstin: company.gstin || null,
        address: buyerAddress,
      },
      lineItems,
      subtotal: order.subtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal: order.grandTotal,
      amountInWords: amountInWords(order.grandTotal),
      paymentMethod: order.paymentMethod,
      paymentStatus,
      dueDate,
      financialYear: fy,
    });

    // Link invoice to order
    order.invoice = invoice._id;
    await order.save();

    // Generate PDF asynchronously
    this._generatePdf(invoice).catch((err) => {
      logger.error(`Failed to generate PDF for ${invoiceNumber}:`, err);
    });

    logger.info(`Invoice generated: ${invoiceNumber} for order ${order.orderNumber}`);
    return invoice;
  }

  /**
   * Generate PDF for an invoice.
   */
  async _generatePdf(invoice) {
    const pdfDir = path.join(config.upload.dir, 'invoices');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `${invoice.invoiceNumber}.pdf`);
    const relativePath = `/uploads/invoices/${invoice.invoiceNumber}.pdf`;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const writeStream = fs.createWriteStream(pdfPath);

      doc.pipe(writeStream);

      // ── Header ──
      doc.fontSize(20).text(invoice.seller.name, { align: 'center' });
      doc.fontSize(10).text(invoice.seller.address, { align: 'center' });
      doc.text(`GSTIN: ${invoice.seller.gstin}`, { align: 'center' });
      doc.moveDown();

      // ── Title ──
      doc.fontSize(16).text('TAX INVOICE', { align: 'center', underline: true });
      doc.moveDown();

      // ── Invoice details ──
      doc.fontSize(10);
      doc.text(`Invoice No: ${invoice.invoiceNumber}`);
      doc.text(`Date: ${invoice.issuedAt.toLocaleDateString('en-IN')}`);
      if (invoice.dueDate) {
        doc.text(`Due Date: ${invoice.dueDate.toLocaleDateString('en-IN')}`);
      }
      doc.moveDown();

      // ── Buyer ──
      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10);
      doc.text(invoice.buyer.companyName);
      doc.text(invoice.buyer.name);
      doc.text(invoice.buyer.address);
      if (invoice.buyer.gstin) doc.text(`GSTIN: ${invoice.buyer.gstin}`);
      doc.moveDown();

      // ── Line items table header ──
      const tableTop = doc.y;
      const col = { sn: 50, desc: 100, hsn: 250, qty: 310, rate: 360, amount: 420, gst: 480, total: 530 };

      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('#', col.sn, tableTop);
      doc.text('Description', col.desc, tableTop);
      doc.text('HSN', col.hsn, tableTop);
      doc.text('Qty', col.qty, tableTop);
      doc.text('Rate', col.rate, tableTop);
      doc.text('Amount', col.amount, tableTop);
      doc.text('GST', col.gst, tableTop);
      doc.text('Total', col.total, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(570, tableTop + 15).stroke();

      // ── Line items ──
      doc.font('Helvetica').fontSize(8);
      let y = tableTop + 20;

      invoice.lineItems.forEach((item, i) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(String(i + 1), col.sn, y);
        doc.text(item.description.substring(0, 25), col.desc, y);
        doc.text(item.hsnCode || '-', col.hsn, y);
        doc.text(`${item.quantity} ${item.unit}`, col.qty, y);
        doc.text(paisaToRupees(item.pricePerUnit), col.rate, y);
        doc.text(paisaToRupees(item.subtotal), col.amount, y);
        doc.text(`${item.gstRate}%`, col.gst, y);
        doc.text(paisaToRupees(item.total), col.total, y);
        y += 18;
      });

      // ── Totals ──
      doc.moveTo(50, y).lineTo(570, y).stroke();
      y += 10;

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Subtotal: ₹${paisaToRupees(invoice.subtotal)}`, 400, y);
      y += 15;
      if (invoice.totalCgst > 0) {
        doc.text(`CGST: ₹${paisaToRupees(invoice.totalCgst)}`, 400, y);
        y += 15;
        doc.text(`SGST: ₹${paisaToRupees(invoice.totalSgst)}`, 400, y);
        y += 15;
      }
      if (invoice.totalIgst > 0) {
        doc.text(`IGST: ₹${paisaToRupees(invoice.totalIgst)}`, 400, y);
        y += 15;
      }
      doc.fontSize(11);
      doc.text(`Grand Total: ₹${paisaToRupees(invoice.grandTotal)}`, 400, y);
      y += 20;

      // ── Amount in words ──
      doc.font('Helvetica').fontSize(9);
      doc.text(`Amount in words: ${invoice.amountInWords}`, 50, y);
      y += 20;

      // ── Payment info ──
      doc.text(`Payment Method: ${invoice.paymentMethod.toUpperCase()}`);
      doc.text(`Payment Status: ${invoice.paymentStatus.toUpperCase()}`);

      doc.end();

      writeStream.on('finish', async () => {
        invoice.pdfPath = relativePath;
        await invoice.save();
        resolve(pdfPath);
      });

      writeStream.on('error', reject);
    });
  }

  /**
   * Get invoice for an order.
   */
  async getInvoice(orderId) {
    const invoice = await Invoice.findOne({ order: orderId }).lean();
    if (!invoice) throw AppError.notFound('Invoice');
    return invoice;
  }

  /**
   * Get PDF file path for download.
   */
  async getInvoicePdfPath(orderId) {
    const invoice = await Invoice.findOne({ order: orderId });
    if (!invoice) throw AppError.notFound('Invoice');
    if (!invoice.pdfPath) throw AppError.notFound('Invoice PDF not yet generated');

    const fullPath = path.join(config.upload.dir, '..', invoice.pdfPath.replace(/^\/uploads/, 'uploads'));
    if (!fs.existsSync(fullPath)) {
      // Regenerate
      await this._generatePdf(invoice);
    }

    return { fullPath: path.resolve(config.upload.dir, '..', invoice.pdfPath.replace(/^\//, '')), invoice };
  }
}

module.exports = new InvoiceService();
