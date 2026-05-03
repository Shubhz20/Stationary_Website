import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin.api';
import { formatPrice, formatDate, STATUS_CONFIG } from '../../utils/format';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import Pagination from '../../components/common/Pagination';
import useSocketEvent from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';
import {
  FiPackage, FiDollarSign, FiUsers, FiAlertTriangle,
  FiCheck, FiX, FiTruck, FiRefreshCw,
} from 'react-icons/fi';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderMeta, setOrderMeta] = useState({});
  const [orderPage, setOrderPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Partners for assignment
  const [partners, setPartners] = useState([]);
  const [assignModal, setAssignModal] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState('');

  const fetchDashboard = async () => {
    try {
      const { data } = await adminApi.getDashboard();
      setStats(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = { page: orderPage, limit: 10 };
      if (orderStatus) params.status = orderStatus;
      const { data } = await adminApi.listOrders(params);
      setOrders(data.data.orders);
      setOrderMeta(data.meta);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDashboard(); }, []);
  useEffect(() => { fetchOrders(); }, [orderPage, orderStatus]);

  // Real-time: new order notification
  useSocketEvent('order:new', () => {
    toast.success('New order received!');
    fetchDashboard();
    fetchOrders();
  });

  const handleAccept = async (orderId) => {
    setActionLoading(orderId);
    try {
      await adminApi.acceptOrder(orderId);
      toast.success('Order accepted');
      fetchOrders();
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Accept failed');
    }
    setActionLoading(null);
  };

  const handleReject = async (orderId) => {
    const reason = window.prompt('Rejection reason:');
    if (!reason) return;
    setActionLoading(orderId);
    try {
      await adminApi.rejectOrder(orderId, { reason });
      toast.success('Order rejected');
      fetchOrders();
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Reject failed');
    }
    setActionLoading(null);
  };

  const openAssignModal = async (orderId) => {
    try {
      const { data } = await adminApi.listUsers({ role: 'delivery_partner', limit: 50 });
      setPartners(data.data.users);
      setAssignModal(orderId);
      setSelectedPartner('');
    } catch (err) {
      toast.error('Failed to load delivery partners');
    }
  };

  const handleAssign = async () => {
    if (!selectedPartner) return;
    setActionLoading(assignModal);
    try {
      await adminApi.assignDelivery(assignModal, { partnerId: selectedPartner });
      toast.success('Delivery partner assigned');
      setAssignModal(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Assignment failed');
    }
    setActionLoading(null);
  };

  const statCards = stats ? [
    { label: 'Orders Today', value: stats.ordersToday ?? 0, icon: FiPackage, color: '#2563eb' },
    { label: 'Revenue Today', value: formatPrice(stats.revenueToday ?? 0), icon: FiDollarSign, color: '#059669' },
    { label: 'Revenue This Month', value: formatPrice(stats.revenueMonth ?? 0), icon: FiDollarSign, color: '#7c3aed' },
    { label: 'Pending Orders', value: stats.ordersByStatus?.pending_payment ?? 0, icon: FiRefreshCw, color: '#f59e0b' },
    { label: 'Total Users', value: stats.totalUsers ?? 0, icon: FiUsers, color: '#6366f1' },
    { label: 'Low Stock Items', value: stats.lowStockCount ?? 0, icon: FiAlertTriangle, color: '#ef4444' },
  ] : [];

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>

      {/* Stats grid */}
      {stats && (
        <div className="stats-grid">
          {statCards.map((card, i) => (
            <div key={i} className="stat-card" style={{ borderTopColor: card.color }}>
              <card.icon className="stat-icon" style={{ color: card.color }} />
              <div className="stat-value">{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Order management */}
      <div className="admin-section">
        <h2>Order Management</h2>
        <div className="olp-filters">
          {['', 'pending_payment', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'].map((s) => (
            <button
              key={s}
              className={`chip ${orderStatus === s ? 'active' : ''}`}
              onClick={() => { setOrderStatus(s); setOrderPage(1); }}
            >
              {s ? (STATUS_CONFIG[s]?.label || s) : 'All'}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <>
            <div className="admin-orders-table">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id}>
                      <td>
                        <Link to={`/orders/${order._id}`} className="order-link">{order.orderNumber}</Link>
                      </td>
                      <td>{order.user?.name || '—'}</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td className="text-right">{formatPrice(order.totalAmount)}</td>
                      <td className="capitalize">{order.paymentMethod}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="action-cell">
                        {order.status === 'pending_payment' && (
                          <>
                            <button
                              onClick={() => handleAccept(order._id)}
                              disabled={actionLoading === order._id}
                              className="action-btn accept"
                              title="Accept"
                            >
                              <FiCheck />
                            </button>
                            <button
                              onClick={() => handleReject(order._id)}
                              disabled={actionLoading === order._id}
                              className="action-btn reject"
                              title="Reject"
                            >
                              <FiX />
                            </button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <button
                            onClick={() => openAssignModal(order._id)}
                            className="action-btn assign"
                            title="Assign Delivery"
                          >
                            <FiTruck />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={orderPage} totalPages={orderMeta.totalPages || 1} onPageChange={setOrderPage} />
          </>
        )}
      </div>

      {/* Assign modal */}
      {assignModal && (
        <div className="review-overlay" onClick={() => setAssignModal(null)}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Delivery Partner</h3>
            <select
              value={selectedPartner}
              onChange={(e) => setSelectedPartner(e.target.value)}
              className="form-input"
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              <option value="">Select partner...</option>
              {partners.map((p) => (
                <option key={p._id} value={p._id}>{p.name} ({p.email})</option>
              ))}
            </select>
            <div className="review-modal-actions">
              <button onClick={() => setAssignModal(null)} className="btn btn-outline">Cancel</button>
              <button onClick={handleAssign} disabled={!selectedPartner || actionLoading} className="btn btn-primary">
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
