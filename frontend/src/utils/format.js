/**
 * Format paisa to INR string (e.g., 500000 → "₹5,000.00")
 */
export function formatPrice(paisa) {
  const rupees = paisa / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(rupees);
}

/**
 * Format date to readable string.
 */
export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Order status display config.
 */
export const STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', color: '#f59e0b', bg: '#fef3c7' },
  confirmed: { label: 'Confirmed', color: '#3b82f6', bg: '#dbeafe' },
  processing: { label: 'Processing', color: '#8b5cf6', bg: '#ede9fe' },
  shipped: { label: 'Shipped', color: '#6366f1', bg: '#e0e7ff' },
  out_for_delivery: { label: 'Out for Delivery', color: '#06b6d4', bg: '#cffafe' },
  delivered: { label: 'Delivered', color: '#10b981', bg: '#d1fae5' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#fee2e2' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fecaca' },
  refunded: { label: 'Refunded', color: '#6b7280', bg: '#f3f4f6' },

  // Payment statuses
  pending: { label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
  paid: { label: 'Paid', color: '#10b981', bg: '#d1fae5' },
  failed: { label: 'Failed', color: '#ef4444', bg: '#fee2e2' },

  // Delivery statuses
  assigned: { label: 'Assigned', color: '#3b82f6', bg: '#dbeafe' },
  picked_up: { label: 'Picked Up', color: '#8b5cf6', bg: '#ede9fe' },
  in_transit: { label: 'In Transit', color: '#6366f1', bg: '#e0e7ff' },
};

export function getStatusConfig(status) {
  return STATUS_CONFIG[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
}
