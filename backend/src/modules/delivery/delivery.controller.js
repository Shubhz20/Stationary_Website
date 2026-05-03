const deliveryService = require('./delivery.service');
const asyncHandler = require('../../common/asyncHandler');

const assignPartner = asyncHandler(async (req, res) => {
  const socketEmitter = req.app.get('socketEmitter');
  const delivery = await deliveryService.assignPartner(
    req.params.orderId,
    req.body.partnerId,
    req.body.estimatedDeliveryAt,
    socketEmitter
  );
  res.status(201).json({ success: true, data: { delivery } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const socketEmitter = req.app.get('socketEmitter');
  const delivery = await deliveryService.updateStatus(
    req.params.deliveryId,
    req.user._id,
    req.body,
    socketEmitter
  );
  res.json({ success: true, data: { delivery } });
});

const updateLocation = asyncHandler(async (req, res) => {
  const socketEmitter = req.app.get('socketEmitter');
  await deliveryService.updateLocation(
    req.params.deliveryId,
    req.user._id,
    req.body.coordinates,
    socketEmitter
  );
  res.json({ success: true });
});

const getTracking = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.getTracking(req.params.deliveryId, req.user);
  res.json({ success: true, data: { delivery } });
});

const myDeliveries = asyncHandler(async (req, res) => {
  const result = await deliveryService.listPartnerDeliveries(req.user._id, req.query);
  res.json({ success: true, data: { deliveries: result.deliveries }, meta: result.meta });
});

const submitProof = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.submitProof(
    req.params.deliveryId,
    req.user._id,
    req.body,
    req.file || null
  );
  res.json({ success: true, data: { delivery } });
});

const getAvailablePartners = asyncHandler(async (req, res) => {
  const partners = await deliveryService.getAvailablePartners();
  res.json({ success: true, data: { partners } });
});

module.exports = {
  assignPartner,
  updateStatus,
  updateLocation,
  getTracking,
  myDeliveries,
  submitProof,
  getAvailablePartners,
};
