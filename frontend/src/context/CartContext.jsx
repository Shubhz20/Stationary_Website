import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ordersApi } from '../api/orders.api';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { isClient } = useAuth();
  const [cart, setCart] = useState({ items: [], summary: { itemCount: 0, subtotal: 0, estimatedTotal: 0 } });
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!isClient) return;
    try {
      setLoading(true);
      const { data } = await ordersApi.getCart();
      setCart(data.data.cart);
    } catch {
      // ignore — cart might not exist yet
    } finally {
      setLoading(false);
    }
  }, [isClient]);

  // Load cart when user is a client
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addToCart = useCallback(async (productId, quantity) => {
    try {
      const { data } = await ordersApi.addToCart(productId, quantity);
      setCart(data.data.cart);
      toast.success('Added to cart');
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to add to cart';
      toast.error(msg);
      throw err;
    }
  }, []);

  const updateItem = useCallback(async (itemId, quantity) => {
    try {
      const { data } = await ordersApi.updateCartItem(itemId, quantity);
      setCart(data.data.cart);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to update');
      throw err;
    }
  }, []);

  const removeItem = useCallback(async (itemId) => {
    try {
      const { data } = await ordersApi.removeCartItem(itemId);
      setCart(data.data.cart);
      toast.success('Item removed');
    } catch (err) {
      toast.error('Failed to remove item');
    }
  }, []);

  const clearCart = useCallback(async () => {
    try {
      const { data } = await ordersApi.clearCart();
      setCart(data.data.cart);
    } catch {
      // ignore
    }
  }, []);

  const value = {
    cart,
    loading,
    itemCount: cart?.summary?.itemCount || 0,
    addToCart,
    updateItem,
    removeItem,
    clearCart,
    refreshCart: fetchCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
