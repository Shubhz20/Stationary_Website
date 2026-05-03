// ── Order statuses ──
const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  REFUNDED: 'refunded',
};

// Allowed status transitions: { currentStatus: [allowedNextStatuses] }
const ORDER_TRANSITIONS = {
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.OUT_FOR_DELIVERY],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [], // terminal
  [ORDER_STATUS.CANCELLED]: [], // terminal
  [ORDER_STATUS.REJECTED]: [], // terminal
  [ORDER_STATUS.REFUNDED]: [], // terminal
};

// ── Delivery statuses ──
const DELIVERY_STATUS = {
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED_ATTEMPT: 'failed_attempt',
  RETURNED: 'returned',
};

const DELIVERY_TRANSITIONS = {
  [DELIVERY_STATUS.ASSIGNED]: [DELIVERY_STATUS.PICKED_UP],
  [DELIVERY_STATUS.PICKED_UP]: [DELIVERY_STATUS.IN_TRANSIT, DELIVERY_STATUS.RETURNED],
  [DELIVERY_STATUS.IN_TRANSIT]: [DELIVERY_STATUS.OUT_FOR_DELIVERY, DELIVERY_STATUS.RETURNED],
  [DELIVERY_STATUS.OUT_FOR_DELIVERY]: [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED_ATTEMPT],
  [DELIVERY_STATUS.FAILED_ATTEMPT]: [DELIVERY_STATUS.OUT_FOR_DELIVERY, DELIVERY_STATUS.RETURNED],
  [DELIVERY_STATUS.DELIVERED]: [], // terminal
  [DELIVERY_STATUS.RETURNED]: [], // terminal
};

// ── Payment statuses ──
const PAYMENT_STATUS = {
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
};

// ── Roles ──
const ROLES = {
  CLIENT: 'client',
  ADMIN: 'admin',
  DELIVERY: 'delivery',
};

// ── Units ──
const PRODUCT_UNITS = ['piece', 'pack', 'box', 'ream', 'dozen', 'set'];

// ── Pagination defaults ──
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

module.exports = {
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  DELIVERY_STATUS,
  DELIVERY_TRANSITIONS,
  PAYMENT_STATUS,
  ROLES,
  PRODUCT_UNITS,
  PAGINATION,
};
