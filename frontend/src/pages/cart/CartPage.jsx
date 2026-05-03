import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useRazorpay } from '../../hooks/useRazorpay';
import { ordersApi } from '../../api/orders.api';
import { formatPrice } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import toast from 'react-hot-toast';
import { FiTrash2, FiMinus, FiPlus } from 'react-icons/fi';
import './CartPage.css';

export default function CartPage() {
  const { cart, loading, updateItem, removeItem, clearCart, refreshCart } = useCart();
  const { user } = useAuth();
  const { openCheckout } = useRazorpay();
  const navigate = useNavigate();
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');

  if (loading) return <Spinner />;

  const items = cart?.items || [];
  const summary = cart?.summary || {};
  const hasCompany = !!user?.company;
  const hasCreditTerms = user?.company?.creditLimit > 0;

  const handleCheckout = async () => {
    if (!hasCompany) {
      toast.error('Please set up your company first');
      navigate('/company');
      return;
    }

    setCheckingOut(true);
    try {
      const { data } = await ordersApi.checkout({
        shippingAddressIndex: 0,
        paymentMethod,
      });

      const order = data.data.order;

      if (paymentMethod === 'razorpay' && data.data.payment) {
        // Open Razorpay modal
        openCheckout({
          orderId: order._id,
          razorpayOrderId: data.data.payment.razorpayOrderId,
          amount: data.data.payment.amount,
          currency: data.data.payment.currency,
          keyId: data.data.payment.keyId,
          user,
          onSuccess: () => {
            refreshCart();
            navigate(`/orders/${order._id}`);
          },
          onFailure: () => {
            refreshCart();
          },
        });
      } else {
        // Credit order — already confirmed
        toast.success(`Order ${order.orderNumber} placed on credit!`);
        refreshCart();
        navigate(`/orders/${order._id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Checkout failed';
      toast.error(msg);
    }
    setCheckingOut(false);
  };

  return (
    <div className="cart-page">
      <h1>Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="empty-cart">
          <p>Your cart is empty.</p>
          <Link to="/products" className="btn btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {items.map((item) => {
              const product = item.product;
              if (!product) return null;
              return (
                <div key={item._id} className="cart-item">
                  <div className="cart-item-img">
                    {product.thumbnail ? (
                      <img src={product.thumbnail} alt={product.name} />
                    ) : (
                      <div className="cart-img-placeholder">{product.name?.[0]}</div>
                    )}
                  </div>
                  <div className="cart-item-info">
                    <Link to={`/products/${product.slug || product._id}`} className="cart-item-name">
                      {product.name}
                    </Link>
                    <span className="cart-item-sku">{product.sku} &middot; {formatPrice(item.pricePerUnit)}/{product.unit}</span>
                  </div>
                  <div className="cart-item-qty">
                    <button onClick={() => updateItem(item._id, Math.max(1, item.quantity - 1))} className="qty-btn"><FiMinus /></button>
                    <span className="qty-value">{item.quantity}</span>
                    <button onClick={() => updateItem(item._id, item.quantity + 1)} className="qty-btn"><FiPlus /></button>
                  </div>
                  <div className="cart-item-total">
                    {formatPrice(item.pricePerUnit * item.quantity)}
                  </div>
                  <button onClick={() => removeItem(item._id)} className="cart-remove-btn">
                    <FiTrash2 />
                  </button>
                </div>
              );
            })}
            <button onClick={clearCart} className="clear-cart-btn">Clear Cart</button>
          </div>

          <div className="cart-summary">
            <h3>Order Summary</h3>
            <div className="summary-row">
              <span>Items ({summary.itemCount})</span>
              <span>{formatPrice(summary.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Estimated GST</span>
              <span>{formatPrice(summary.estimatedGst)}</span>
            </div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>{formatPrice(summary.estimatedTotal)}</span>
            </div>

            <div className="payment-method-section">
              <h4>Payment Method</h4>
              <label className="radio-option">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="razorpay"
                  checked={paymentMethod === 'razorpay'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>Pay Now (Razorpay)</span>
              </label>
              {hasCreditTerms && (
                <label className="radio-option">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="credit"
                    checked={paymentMethod === 'credit'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span>Pay on Credit (Net-{user.company.paymentTermsDays})</span>
                </label>
              )}
            </div>

            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="btn btn-primary btn-lg checkout-btn"
            >
              {checkingOut ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
