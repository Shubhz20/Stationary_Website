import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ordersApi } from '../../api/orders.api';
import { deliveryApi } from '../../api/delivery.api';
import { useAuth } from '../../context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { formatPrice, formatDate, formatDateTime, STATUS_CONFIG } from '../../utils/format';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import toast from 'react-hot-toast';
import { FiDownload, FiStar, FiTruck, FiArrowLeft } from 'react-icons/fi';
import './OrderDetailPage.css';

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Review state
  const [reviewProduct, setReviewProduct] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const { data } = await ordersApi.getOrder(id);
        setOrder(data.data.order);
        // Fetch tracking if shipped/out_for_delivery
        if (['shipped', 'out_for_delivery', 'delivered'].includes(data.data.order.status)) {
          try {
            const trackRes = await deliveryApi.getTracking(id);
            setTracking(trackRes.data.data.delivery);
          } catch { }
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchOrder();
  }, [id]);

  // Real-time order updates
  useSocketEvent(`order:${id}:updated`, (data) => {
    setOrder((prev) => prev ? { ...prev, ...data } : prev);
    toast.success(`Order updated to ${STATUS_CONFIG[data.status]?.label || data.status}`);
  });

  useSocketEvent(`order:${id}:tracking`, (data) => {
    setTracking((prev) => prev ? { ...prev, ...data } : data);
  });

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      await ordersApi.cancelOrder(id, { reason: 'Cancelled by customer' });
      const { data } = await ordersApi.getOrder(id);
      setOrder(data.data.order);
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Cancel failed');
    }
    setCancelling(false);
  };

  const handleDownloadInvoice = async () => {
    try {
      const response = await ordersApi.downloadInvoice(id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${order.orderNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download invoice');
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await ordersApi.submitReview(id, {
        productId: reviewProduct,
        rating,
        comment,
      });
      toast.success('Review submitted!');
      setReviewProduct(null);
      setRating(5);
      setComment('');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Review failed');
    }
    setSubmittingReview(false);
  };

  if (loading) return <Spinner />;
  if (!order) return <div className="page-container"><p>Order not found.</p></div>;

  const canCancel = ['pending', 'confirmed'].includes(order.status);
  const canReview = order.status === 'delivered';

  return (
    <div className="order-detail-page">
      <Link to="/orders" className="back-link"><FiArrowLeft /> Back to Orders</Link>

      <div className="od-header">
        <div>
          <h1>{order.orderNumber}</h1>
          <span className="od-date">Placed {formatDateTime(order.createdAt)}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Status timeline */}
      <div className="status-timeline">
        {order.statusHistory?.map((entry, i) => (
          <div key={i} className="timeline-entry">
            <div className="timeline-dot" />
            <div className="timeline-content">
              <span className="timeline-status">{STATUS_CONFIG[entry.status]?.label || entry.status}</span>
              <span className="timeline-time">{formatDateTime(entry.changedAt)}</span>
              {entry.reason && <span className="timeline-reason">{entry.reason}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="od-grid">
        {/* Order items */}
        <div className="od-section">
          <h3>Items</h3>
          <div className="od-items">
            {order.orderItems.map((item, i) => {
              const snap = item.productSnapshot || {};
              return (
                <div key={i} className="od-item">
                  <div className="od-item-info">
                    <span className="od-item-name">{snap.name || 'Product'}</span>
                    <span className="od-item-sku">{snap.sku} · {formatPrice(item.pricePerUnit)}/{snap.unit}</span>
                  </div>
                  <span className="od-item-qty">× {item.quantity}</span>
                  <span className="od-item-total">{formatPrice(item.subtotal)}</span>
                  {canReview && (
                    <button
                      className="review-btn"
                      onClick={() => setReviewProduct(item.product)}
                    >
                      <FiStar /> Review
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="od-section">
          <h3>Summary</h3>
          <div className="od-summary">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>GST</span>
              <span>{formatPrice(order.gstTotal)}</span>
            </div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>

          <div className="od-meta">
            <div className="meta-row">
              <span>Payment</span>
              <span className="capitalize">{order.paymentMethod}</span>
            </div>
            <div className="meta-row">
              <span>Payment Status</span>
              <StatusBadge status={order.paymentStatus} />
            </div>
          </div>

          <div className="od-actions">
            {['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status) && (
              <button onClick={handleDownloadInvoice} className="btn btn-outline">
                <FiDownload /> Invoice PDF
              </button>
            )}
            {canCancel && (
              <button onClick={handleCancel} disabled={cancelling} className="btn btn-danger">
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tracking */}
      {tracking && (
        <div className="od-section od-tracking">
          <h3><FiTruck /> Delivery Tracking</h3>
          <div className="tracking-info">
            <div className="meta-row">
              <span>Partner</span>
              <span>{tracking.partner?.name || '—'}</span>
            </div>
            <div className="meta-row">
              <span>Status</span>
              <StatusBadge status={tracking.status} />
            </div>
            {tracking.estimatedDelivery && (
              <div className="meta-row">
                <span>ETA</span>
                <span>{formatDate(tracking.estimatedDelivery)}</span>
              </div>
            )}
          </div>
          {tracking.trackingEvents?.length > 0 && (
            <div className="tracking-events">
              {tracking.trackingEvents.map((evt, i) => (
                <div key={i} className="tracking-event">
                  <span className="te-time">{formatDateTime(evt.timestamp)}</span>
                  <span className="te-status">{evt.status}</span>
                  {evt.note && <span className="te-note">{evt.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shipping address */}
      {order.shippingAddress && (
        <div className="od-section">
          <h3>Shipping Address</h3>
          <p className="od-address">
            {order.shippingAddress.street}, {order.shippingAddress.city}<br />
            {order.shippingAddress.state} — {order.shippingAddress.pincode}
          </p>
        </div>
      )}

      {/* Review modal */}
      {reviewProduct && (
        <div className="review-overlay" onClick={() => setReviewProduct(null)}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Write a Review</h3>
            <form onSubmit={handleSubmitReview}>
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`star-btn ${s <= rating ? 'active' : ''}`}
                    onClick={() => setRating(s)}
                  >
                    <FiStar />
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience..."
                rows={4}
                className="review-textarea"
              />
              <div className="review-modal-actions">
                <button type="button" onClick={() => setReviewProduct(null)} className="btn btn-outline">Cancel</button>
                <button type="submit" disabled={submittingReview} className="btn btn-primary">
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
