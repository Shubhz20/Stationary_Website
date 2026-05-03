import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { catalogApi } from '../../api/catalog.api';
import { formatPrice } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Pagination from '../../components/common/Pagination';
import { FiSearch, FiStar } from 'react-icons/fi';
import './ProductListPage.css';

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');

  const page = Number(searchParams.get('page')) || 1;
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || '-createdAt';

  useEffect(() => {
    catalogApi.getCategories().then(({ data }) => {
      setCategories(data.data.categories);
    });
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 20, sort };
        if (category) params.category = category;
        if (searchParams.get('search')) params.search = searchParams.get('search');

        const { data } = await catalogApi.listProducts(params);
        setProducts(data.data.products);
        setMeta(data.meta);
      } catch (err) {
        console.error('Failed to load products:', err);
      }
      setLoading(false);
    };
    fetchProducts();
  }, [page, category, sort, searchParams]);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search.trim()) {
      params.set('search', search.trim());
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleCategoryChange = (cat) => {
    const params = new URLSearchParams(searchParams);
    if (cat) {
      params.set('category', cat);
    } else {
      params.delete('category');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleSortChange = (newSort) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', newSort);
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    setSearchParams(params);
  };

  return (
    <div className="product-list-page">
      <div className="plp-header">
        <h1>Products</h1>
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-wrap">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </div>

      <div className="plp-filters">
        <div className="category-chips">
          <button
            className={`chip ${!category ? 'active' : ''}`}
            onClick={() => handleCategoryChange('')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`chip ${category === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="sort-select"
        >
          <option value="-createdAt">Newest</option>
          <option value="name">Name A-Z</option>
          <option value="-name">Name Z-A</option>
          <option value="basePrice">Price: Low to High</option>
          <option value="-basePrice">Price: High to Low</option>
          <option value="avgRating">Top Rated</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p>No products found. Try a different search or filter.</p>
        </div>
      ) : (
        <>
          <div className="product-grid">
            {products.map((product) => (
              <Link
                key={product._id}
                to={`/products/${product.slug}`}
                className="product-card"
              >
                <div className="product-img-wrap">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt={product.name} />
                  ) : (
                    <div className="product-img-placeholder">
                      {product.category?.[0] || 'S'}
                    </div>
                  )}
                </div>
                <div className="product-info">
                  <span className="product-category">{product.category}</span>
                  <h3 className="product-name">{product.name}</h3>
                  {product.brand && (
                    <span className="product-brand">{product.brand}</span>
                  )}
                  <div className="product-price-row">
                    <span className="product-price">
                      {formatPrice(product.basePrice)}
                    </span>
                    <span className="product-unit">/{product.unit}</span>
                  </div>
                  {product.priceTiers?.length > 0 && (
                    <span className="bulk-tag">
                      Bulk from {formatPrice(product.priceTiers[product.priceTiers.length - 1].pricePerUnit)}
                    </span>
                  )}
                  <div className="product-rating">
                    <FiStar className="star-icon" />
                    <span>{product.avgRating?.toFixed(1) || '0.0'}</span>
                    <span className="review-count">({product.totalReviews || 0})</span>
                  </div>
                  {product.stock === 0 && (
                    <span className="out-of-stock-tag">Out of Stock</span>
                  )}
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
