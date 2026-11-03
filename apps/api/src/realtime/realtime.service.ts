import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export const rooms = {
  user: (id: string) => `user:${id}`,
  order: (id: string) => `order:${id}`,
  staff: 'staff',
} as const;

/**
 * Real-time yuborish. Gateway ishga tushganda server ulanadi.
 * Server bo'lmasa (masalan, skript) — jim o'tkazib yuboradi.
 */
@Injectable()
export class RealtimeService {
  private ns?: Namespace;

  attach(ns: Namespace) {
    this.ns = ns;
  }

  toUser(userId: string, event: string, data: unknown) {
    this.ns?.to(rooms.user(userId)).emit(event, data);
  }

  toStaff(event: string, data: unknown) {
    this.ns?.to(rooms.staff).emit(event, data);
  }

  toOrder(orderId: string, event: string, data: unknown) {
    this.ns?.to(rooms.order(orderId)).emit(event, data);
  }
}
