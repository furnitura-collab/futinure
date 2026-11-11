import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { RT } from '@mebel/shared';
import { useToast } from '../components/ui';
import { tokens } from './api';
import { useAuth } from './auth';
import { API_URL } from './config';

const Ctx = createContext<Socket | null>(null);

/**
 * Ilova ochiq paytda real-time yangilanish (yopiq bo'lsa — push).
 * Hodisa kelganda tegishli so'rovlar yangilanadi, ekranlar o'zi qayta chiziladi.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!me) return;
    const s = io(`${API_URL}/rt`, {
      auth: (cb) => cb({ token: tokens.get()?.accessToken }),
      transports: ['websocket'],
    });
    const orderChanged = (e: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', e.orderId] });
      // Haydovchi xodimlar xonasida — o'z ro'yxatini yangilaydi
      if (me.role === 'DRIVER') void qc.invalidateQueries({ queryKey: ['driver'] });
    };
    s.on(RT.ORDER_STATUS_CHANGED, orderChanged);
    s.on(RT.ORDER_TERMS_SET, orderChanged);
    s.on(RT.PAYMENT_UPDATED, (p: { orderId: string | null }) => {
      if (p.orderId) orderChanged({ orderId: p.orderId });
      void qc.invalidateQueries({ queryKey: ['balance'] });
    });
    s.on(RT.CHAT_MESSAGE, (m: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: ['chat', m.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    });
    s.on(RT.DELIVERY_ASSIGNED, () => void qc.invalidateQueries({ queryKey: ['driver'] }));
    s.on(RT.CHAT_READ, (e: { orderId: string }) => void qc.invalidateQueries({ queryKey: ['chat', e.orderId] }));
    s.on(RT.NOTIFICATION, (n: { title: string; body: string }) => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      toast(`${n.title}: ${n.body}`);
    });
    setSocket(s);

    // Fonda socket uziladi; qaytganda qayta ulanadi va ma'lumotlar yangilanadi
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!s.connected) s.connect();
        void qc.invalidateQueries();
      }
    });
    return () => {
      sub.remove();
      s.disconnect();
      setSocket(null);
    };
  }, [me?.id, qc, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx value={socket}>{children}</Ctx>;
}

/** Buyurtma ekrani ochiq ekan — shu buyurtma xonasiga obuna (chat, status) */
export function useOrderRoom(orderId: string | undefined) {
  const socket = use(Ctx);
  useEffect(() => {
    if (!socket || !orderId) return;
    const join = () => socket.emit(RT.ORDER_SUBSCRIBE, { orderId });
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit(RT.ORDER_UNSUBSCRIBE, { orderId });
    };
  }, [socket, orderId]);
}
