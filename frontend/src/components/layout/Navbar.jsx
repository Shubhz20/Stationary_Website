import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { FiShoppingCart, FiUser, FiLogOut, FiPackage, FiTruck } from 'react-icons/fi';
import './Navbar.css';

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, isClient, isDelivery, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          StationeryHub
        </Link>

        <div className="navbar-links">
          <Link to="/products" className="nav-link">Products</Link>

          {isAuthenticated ? (
            <>
              {isClient && (
                <>
                  <Link to="/cart" className="nav-link cart-link">
                    <FiShoppingCart />
                    {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
                  </Link>
                  <Link to="/orders" className="nav-link">
                    <FiPackage /> Orders
                  </Link>
                </>
              )}

              {isDelivery && (
                <Link to="/delivery" className="nav-link">
                  <FiTruck /> My Deliveries
                </Link>
              )}

              {isAdmin && (
                <Link to="/admin" className="nav-link">
                  Dashboard
                </Link>
              )}

              <div className="nav-user-menu">
                <button className="nav-user-btn">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="nav-avatar" />
                  ) : (
                    <FiUser />
                  )}
                  <span className="nav-username">{user.name?.split(' ')[0]}</span>
                </button>
                <div className="nav-dropdown">
                  <Link to="/profile" className="dropdown-item">Profile</Link>
                  {isClient && <Link to="/company" className="dropdown-item">Company</Link>}
                  <button onClick={logout} className="dropdown-item logout-btn">
                    <FiLogOut /> Logout
                  </button>
                </div>
              </div>
            </>
          ) : (
            <Link to="/login" className="nav-link login-btn">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
