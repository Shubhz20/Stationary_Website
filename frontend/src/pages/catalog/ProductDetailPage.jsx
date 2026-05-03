import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { catalogApi } from '../../api/catalog.api';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { formatPrice } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import { FiStar, FiShoppingCart, FiMinus, FiPlus } from 'react-icons/fi';
import './ProductDetailPage.css';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { isClient } = useAuth();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await catalogApi.getProduct(slug);
        setProduct(data.data.product);
        setQuantity(data.data.product.minOrderQty || 1);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetch();
  }, [slug]);

  if (loading) return <Spinner />;
  if (!product) return <div className="page-container"><p>Product not found.</p></div>;

  // Resolve current price tier
  const getCurrentPrice = () => {
    if (!product.priceTiers?.length) return product.basePrice;
    for (const tier of product.priceTiers) {
      if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
        return tier.pricePerUnit;
      }
    }
    return product.basePrice;
  };

  const currentPrice = getCurrentPrice();
  const lineTotal = currentPrice * quantity;
  const gst = Math.round(lineTotal * (product.gstRate / 100));

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addToCart(product._id, quantity);
    } catch { }
    setAdding(false);
  };

  return (
    <div className="pdp">
      <div className="pdp-grid">
        <div className="pdp-images">
          <div className="pdp-main-image">
            {product.images?.length > 0 ? (
              <img src={product.images[selectedImage]} alt={product.name} />
            ) : (
              <div className="pdp-img-placeholder">{product.category?.[0] || 'S'}</div>
            )}
          </div>
          {product.images?.length > 1 && (
            <div className="pdp-thumbnails">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  className={`pdp-thumb ${i === selectedImage ? 'active' : ''}`}
                  onClick={() => setSelectedImage(i)}
                >
                  <img src={img} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp-details">
          <span className="pdp-category">{product.category} / {product.subcategory}</span>
          <h1 className="pdp-name">{product.name}</h1>
          {product.brand && <span className="pdp-brand">by {product.brand}</span>}

          <div className="pdp-rating">
            <FiStar className="star-icon" />
            <span>{product.avgRating?.toFixed(1) || '0.0'}</span>
            <span className="review-count">({product.totalReviews} reviews)</span>
          </div>

          <div className="pdp-price-section">
            <div className="pdp-price">{formatPrice(currentPrice)}<span className="pdp-unit">/{product.unit}</span></div>
            <span className="pdp-sku">SKU: {product.sku}</span>
          </div>

          {product.priceTiers?.length > 0 && (
            <div className="price-tiers">
              <h4>Bulk Pricing</h4>
              <table className="tier-table">
                <thead>
                  <tr><th>Quantity</th><th>Price/unit</th></tr>
                </thead>
                <tbody>
                  {product.priceTiers.map((tier, i) => (
                    <tr key={i} className={quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty) ? 'active-tier' : ''}>
                      <td>{tier.minQty}{tier.maxQty ? ` - ${tier.maxQty}` : '+'}</td>
                      <td>{formatPrice(tier.pricePerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="pdp-description">{product.description}</p>

          {product.attributes && Object.keys(product.attributes).length > 0 && (
            <div className="pdp-attributes">
              {Object.entries(product.attributes instanceof Map ? Object.fromEntries(product.attributes) : product.attributes).map(([key, value]) => (
                <div key={key} className="attr-row">
                  <span className="attr-key">{key}:</span>
                  <span className="attr-value">{value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pdp-stock">
            {product.stock > 0 ? (
              <span className="in-stock">{product.stock.toLocaleString()} in stock</span>
            ) : (
              <span className="out-of-stock">Out of Stock</span>
            )}
          </div>

          {isClient && product.stock > 0 && (
            <div className="pdp-add-section">
              <div className="quantity-control">
                <button onClick={() => setQuantity(Math.max(product.minOrderQty, quantity - 1))} className="qty-btn"><FiMinus /></button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || product.minOrderQty;
                    setQuantity(Math.min(Math.max(val, product.minOrderQty), product.maxOrderQty));
                  }}
                  className="qty-input"
                  min={product.minOrderQty}
                  max={product.maxOrderQty}
                />
                <button onClick={() => setQuantity(Math.min(product.maxOrderQty, quantity + 1))} className="qty-btn"><FiPlus /></button>
              </div>
              <div className="pdp-line-total">
                <span>Subtotal: {formatPrice(lineTotal)}</span>
                <span className="gst-info">+ {formatPrice(gst)} GST ({product.gstRate}%)</span>
              </div>
              <button onClick={handleAdd} disabled={adding} className="btn btn-primary btn-lg add-btn">
                <FiShoppingCart /> {adding ? 'Adding...' : 'Add to Cart'}
              </button>
              <p className="min-qty-note">Min order: {product.minOrderQty} {product.unit}(s)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
