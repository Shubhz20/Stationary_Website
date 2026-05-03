import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ordersApi } from '../../api/orders.api';
import { formatPrice, formatDate, STATUS_CONFIG } from '../../utils/format';
import StatusBadge from '../../components/common/StatusBadge';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import { FiPackage, FiFilter } from 'react-icons/fi';
import './OrderListPage.css';

export default function OrderListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);

  const page = Number(searchParams.get('page')) || 1;
  const status = searchParams.get('status') || '';

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 10 };
        if (status) params.status = status;
        const { data } = await ordersApi.listMyOrders(params);
        setOrders(data.data.orders);
        setMeta(data.meta);
      } catch (err) {
        console.error('Failed to load orders:', err);
      }
      setLoading(false);
    };
    fetchOrders();
  }, [page, status]);

  const handleStatusFilter = (s) => {
    const params = new URLSearchParams(searchParams);
    if (s) {
      params.set('status', s);
    } else {
      params.delete('status');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    setSearchParams(params);
  };

  const statuses = ['pending_payment', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'];

  return (
    <div className="order-list-page">
      <div className="olp-header">
        <h1><FiPackage /> My Orders</h1>
      </div>

      <div className="olp-filters">
        <FiFilter className="filter-icon" />
        <button
          className={`chip ${!status ? 'active' : ''}`}
          onClick={() => handleStatusFilter('')}
        >
          All
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            className={`chip ${status === s ? 'active' : ''}`}
            onClick={() => handleStatusFilter(s)}
          >
            {STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <FiPackage size={48} />
          <p>No orders found.</p>
          <Link to="/products" className="btn btn-primary">Browse Products</Link>
        </div>
      ) : (
        <>
          <div className="order-cards">
            {orders.map((order) => (
              <Link key={order._id} to={`/orders/${order._id}`} className="order-card">
                <div className="order-card-header">
                  <span className="order-number">{order.orderNumber}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="order-card-body">
                  <div className="order-items-preview">
                    {order.orderItems.slice(0, 3).map((item, i) => (
                      <span key={i} className="item-preview">
                        {item.productSnapshot?.name || 'Product'} × {item.quantity}
                      </span>
                    ))}
                    {order.orderItems.length > 3 && (
                      <span className="item-preview more">+{order.orderItems.length - 3} more</span>
                    )}
                  </div>
                  <div className="order-card-footer">
                    <span className="order-date">{formatDate(order.createdAt)}</span>
                    <span className="order-total">{formatPrice(order.totalAmount)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={meta.totalPages || 1}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
