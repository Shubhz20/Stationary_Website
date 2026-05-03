import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiBox, FiTruck, FiShield, FiCreditCard } from 'react-icons/fi';
import './LandingPage.css';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-content">
          <h1>Bulk Stationery Ordering<br />Made Simple</h1>
          <p>
            Order office supplies in bulk at wholesale prices. Tiered pricing,
            credit terms, real-time delivery tracking, and GST-compliant invoicing
            — all in one platform.
          </p>
          <div className="hero-actions">
            <Link to="/products" className="btn btn-primary btn-lg">
              Browse Products
            </Link>
            {!isAuthenticated && (
              <Link to="/login" className="btn btn-outline btn-lg">
                Sign In with Google
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Why Businesses Choose Us</h2>
        <div className="features-grid">
          <div className="feature-card">
            <FiBox className="feature-icon" />
            <h3>Bulk Pricing</h3>
            <p>Tiered pricing that drops automatically as quantity increases. The more you order, the more you save.</p>
          </div>
          <div className="feature-card">
            <FiTruck className="feature-icon" />
            <h3>Real-Time Tracking</h3>
            <p>Track your deliveries live from warehouse to your office. Know exactly when supplies will arrive.</p>
          </div>
          <div className="feature-card">
            <FiCreditCard className="feature-icon" />
            <h3>Credit Terms</h3>
            <p>Approved businesses get Net-30/60 credit terms. Order now, pay later with flexible payment options.</p>
          </div>
          <div className="feature-card">
            <FiShield className="feature-icon" />
            <h3>GST Invoicing</h3>
            <p>Automatic GST-compliant tax invoices with CGST/SGST/IGST breakdown. Perfect for your accounting team.</p>
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>Ready to streamline your office supplies?</h2>
        <p>Join hundreds of businesses who order smarter with StationeryHub.</p>
        <Link to={isAuthenticated ? '/products' : '/login'} className="btn btn-primary btn-lg">
          Get Started
        </Link>
      </section>
    </div>
  );
}
