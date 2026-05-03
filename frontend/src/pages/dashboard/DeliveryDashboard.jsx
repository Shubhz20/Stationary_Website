import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { deliveryApi } from '../../api/delivery.api';
import { formatPrice, formatDate, formatDateTime } from '../../utils/format';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import useSocketEvent from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';
import { FiTruck, FiMapPin, FiCheck, FiCamera } from 'react-icons/fi';
import './DeliveryDashboard.css';

const STATUS_FLOW = ['assigned', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];

export default function DeliveryDashboard() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const locationInterval = useRef(null);

  const fetchDeliveries = async () => {
    try {
      const { data } = await deliveryApi.myDeliveries();
      setDeliveries(data.data.deliveries);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeliveries();

    // Share location every 30s for active deliveries
    locationInterval.current = setInterval(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const activeDelivery = deliveries.find((d) =>
            ['picked_up', 'in_transit', 'out_for_delivery'].includes(d.status)
          );
          if (activeDelivery) {
            try {
              await deliveryApi.updateLocation(activeDelivery._id, {
                coordinates: [pos.coords.longitude, pos.coords.latitude],
              });
            } catch { }
          }
        },
        () => { },
        { enableHighAccuracy: true }
      );
    }, 30000);

    return () => clearInterval(locationInterval.current);
  }, []);

  useSocketEvent('delivery:assigned', () => {
    toast.success('New delivery assigned!');
    fetchDeliveries();
  });

  const handleStatusUpdate = async (deliveryId, newStatus) => {
    setActionLoading(deliveryId);
    try {
      await deliveryApi.updateStatus(deliveryId, { status: newStatus });
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      fetchDeliveries();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Update failed');
    }
    setActionLoading(null);
  };

  const getNextStatus = (currentStatus) => {
    const idx = STATUS_FLOW.indexOf(currentStatus);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  };

  if (loading) return <Spinner />;

  const activeDeliveries = deliveries.filter((d) => d.status !== 'delivered');
  const completedDeliveries = deliveries.filter((d) => d.status === 'delivered');

  return (
    <div className="delivery-dashboard">
      <h1><FiTruck /> My Deliveries</h1>

      {activeDeliveries.length === 0 && completedDeliveries.length === 0 && (
        <div className="empty-state">
          <FiTruck size={48} />
          <p>No deliveries assigned yet.</p>
        </div>
      )}

      {activeDeliveries.length > 0 && (
        <div className="dd-section">
          <h2>Active ({activeDeliveries.length})</h2>
          <div className="delivery-cards">
            {activeDeliveries.map((del) => {
              const nextStatus = getNextStatus(del.status);
              return (
                <div key={del._id} className="delivery-card active-delivery">
                  <div className="dc-header">
                    <span className="dc-order">Order: {del.order?.orderNumber || del.order}</span>
                    <StatusBadge status={del.status} />
                  </div>

                  {del.order?.shippingAddress && (
                    <div className="dc-address">
                      <FiMapPin />
                      <span>
                        {del.order.shippingAddress.street}, {del.order.shippingAddress.city} — {del.order.shippingAddress.pincode}
                      </span>
                    </div>
                  )}

                  <div className="dc-meta">
                    <span>Assigned: {formatDateTime(del.assignedAt)}</span>
                    {del.estimatedDelivery && <span>ETA: {formatDate(del.estimatedDelivery)}</span>}
                  </div>

                  {/* Status progression */}
                  <div className="status-progress">
                    {STATUS_FLOW.map((s, i) => (
                      <div
                        key={s}
                        className={`progress-step ${STATUS_FLOW.indexOf(del.status) >= i ? 'done' : ''} ${del.status === s ? 'current' : ''}`}
                      >
                        <div className="progress-dot" />
                        <span>{s.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>

                  <div className="dc-actions">
                    {nextStatus && (
                      <button
                        onClick={() => handleStatusUpdate(del._id, nextStatus)}
                        disabled={actionLoading === del._id}
                        className="btn btn-primary"
                      >
                        <FiCheck /> Mark as {nextStatus.replace(/_/g, ' ')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completedDeliveries.length > 0 && (
        <div className="dd-section">
          <h2>Completed ({completedDeliveries.length})</h2>
          <div className="delivery-cards">
            {completedDeliveries.map((del) => (
              <div key={del._id} className="delivery-card completed-delivery">
                <div className="dc-header">
                  <span className="dc-order">Order: {del.order?.orderNumber || del.order}</span>
                  <StatusBadge status={del.status} />
                </div>
                <div className="dc-meta">
                  <span>Delivered: {del.deliveredAt ? formatDateTime(del.deliveredAt) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
