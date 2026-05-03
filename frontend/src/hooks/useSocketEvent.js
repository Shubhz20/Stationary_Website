import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

/**
 * Subscribe to a socket event. Automatically cleans up on unmount.
 * @param {string} event - Event name
 * @param {function} handler - Callback
 */
export function useSocketEvent(event, handler) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !event) return;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
}
