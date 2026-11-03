import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { RT } from '@mebel/shared';
import { tokenStore } from './api';
import { useAuth } from './auth';
import { som } from './format';
import type { OrderStatus } from '@mebel/shared';

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

  useEffect(() => {
    if (!me) return;
    const s = io('/rt', {
      // Har qayta ulanishda yangi token (refresh'dan keyin)
      auth: (cb) => cb({ token: tokenStore.get()?.accessToken }),
      transports: ['websocket'],
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on(RT.ORDER_CREATED, (o: { number: string; grandTotal: number }) => {
      beep();
      toast.success(`Yangi buyurtma ${o.number}`, { description: som(o.grandTotal) });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    });
    s.on(RT.ORDER_STATUS_CHANGED, (e: { orderId: string; number: string; to: OrderStatus }) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', e.orderId] });
    });
    s.on(RT.PAYMENT_CREATED, (p: { amount: number; method: string }) => {
      beep();
      toast.info(`${p.method === 'CASH' ? 'Haydovchi naqd oldi' : 'Yangi chek'}: ${som(p.amount)}`);
      void qc.invalidateQueries({ queryKey: ['payments'] });
    });
    s.on(RT.PAYMENT_UPDATED, (p: { orderId: string | null }) => {
      void qc.invalidateQueries({ queryKey: ['payments'] });
      if (p.orderId) void qc.invalidateQueries({ queryKey: ['order', p.orderId] });
    });
    s.on(RT.CHAT_MESSAGE, (m: { orderId: string; orderNumber: string; sender: { role: string }; text: string | null }) => {
      void qc.invalidateQueries({ queryKey: ['chat', m.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (m.sender.role === 'CUSTOMER') toast(`💬 ${m.orderNumber}`, { description: m.text ?? '📎 fayl' });
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

