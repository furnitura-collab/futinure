import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { RT, type OrderStatus } from '@mebel/shared';
import { useI18n } from '@/i18n';
import { API_URL, tokenStore } from './api';
import { useAuth } from './auth';

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, connected: false });

/** Yangi buyurtma/chek uchun qisqa signal (fayl kerak emas) */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // brauzer ovozni bloklagan (foydalanuvchi hali sahifaga bosmagan)
  }
}

/**
 * Bitta socket butun panel uchun. Hodisa kelganda tegishli so'rovlar yangilanadi —
 * sahifalar o'zi qayta yuklanadi, qo'lda "yangilash" kerak emas.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // Til almashganda socket qayta ulanmasin — matnlar ref orqali olinadi
  const i18n = useI18n();
  const i18nRef = useRef(i18n);
  useEffect(() => {
    i18nRef.current = i18n;
  });

  useEffect(() => {
    if (!me) return;
    const tr = () => i18nRef.current;
    const s = io(`${API_URL}/rt`, {
      // Har qayta ulanishda yangi token (refresh'dan keyin)
      auth: (cb) => cb({ token: tokenStore.get()?.accessToken }),
      transports: ['websocket'],
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on(RT.ORDER_CREATED, (o: { number: string; grandTotal: number }) => {
      beep();
      toast.success(tr().t('realtime.newOrder', { number: o.number }), { description: tr().money(o.grandTotal) });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    });
    s.on(RT.ORDER_STATUS_CHANGED, (e: { orderId: string; number: string; to: OrderStatus }) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', e.orderId] });
    });
    // Shartlar saqlandi (status NEW qoladi) — kartochka va tafsilot yangilanadi
    s.on(RT.ORDER_TERMS_SET, (e: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', e.orderId] });
    });
    s.on(RT.PAYMENT_CREATED, (p: { amount: number; method: string }) => {
      beep();
      const amount = tr().money(p.amount);
      toast.info(p.method === 'CASH' ? tr().t('realtime.cashCollected', { amount }) : tr().t('realtime.newReceipt', { amount }));
      void qc.invalidateQueries({ queryKey: ['payments'] });
    });
    s.on(RT.PAYMENT_UPDATED, (p: { orderId: string | null }) => {
      void qc.invalidateQueries({ queryKey: ['payments'] });
      if (p.orderId) void qc.invalidateQueries({ queryKey: ['order', p.orderId] });
    });
    s.on(RT.CHAT_MESSAGE, (m: { orderId: string; orderNumber: string; sender: { role: string }; text: string | null }) => {
      void qc.invalidateQueries({ queryKey: ['chat', m.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (m.sender.role === 'CUSTOMER') toast(m.orderNumber, { description: m.text ?? tr().t('realtime.attachment') });
    });
    s.on(RT.DELIVERY_ASSIGNED, (e: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: ['order', e.orderId] });
      void qc.invalidateQueries({ queryKey: ['drivers'] });
    });
    s.on(RT.CHAT_READ, (e: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: ['chat', e.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [me, qc]);

  return <RealtimeContext value={{ socket, connected }}>{children}</RealtimeContext>;
}

export function useRealtime() {
  return use(RealtimeContext);
}

/** Buyurtma sahifasi ochiq ekan — shu buyurtma xonasiga obuna */
export function useOrderRoom(orderId: string | undefined) {
  const { socket, connected } = useRealtime();
  useEffect(() => {
    if (!socket || !connected || !orderId) return;
    socket.emit(RT.ORDER_SUBSCRIBE, { orderId });
    return () => {
      socket.emit(RT.ORDER_UNSUBSCRIBE, { orderId });
    };
  }, [socket, connected, orderId]);
}

