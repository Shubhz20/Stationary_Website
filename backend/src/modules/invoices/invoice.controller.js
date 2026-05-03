const path = require('path');
const invoiceService = require('./invoice.service');
const asyncHandler = require('../../common/asyncHandler');

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.params.orderId);
  res.json({ success: true, data: { invoice } });
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const { fullPath, invoice } = await invoiceService.getInvoicePdfPath(req.params.orderId);
  res.download(fullPath, `${invoice.invoiceNumber}.pdf`);
});

module.exports = { getInvoice, downloadInvoice };
