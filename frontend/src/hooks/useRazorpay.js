import { useCallback } from 'react';
import { ordersApi } from '../api/orders.api';
import toast from 'react-hot-toast';

/**
 * Hook for Razorpay checkout flow.
 * Loads the Razorpay script and opens the checkout modal.
 */
export function useRazorpay() {
  const loadScript = useCallback(() => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const openCheckout = useCallback(
    async ({ orderId, razorpayOrderId, amount, currency, keyId, user, onSuccess, onFailure }) => {
      const loaded = await loadScript();
      if (!loaded) {
        toast.error('Failed to load payment gateway');
        return;
      }

      const options = {
        key: keyId,
        amount,
        currency,
        name: 'StationeryHub',
        description: `Order Payment`,
        order_id: razorpayOrderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#2563eb',
        },
        handler: async (response) => {
          try {
            await ordersApi.verifyPayment(orderId, {
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });
            toast.success('Payment successful!');
            onSuccess?.();
          } catch (err) {
            toast.error('Payment verification failed');
            onFailure?.(err);
          }
        },
        modal: {
          ondismiss: () => {
            toast.error('Payment cancelled');
            onFailure?.();
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    },
    [loadScript]
  );

  return { openCheckout };
}
