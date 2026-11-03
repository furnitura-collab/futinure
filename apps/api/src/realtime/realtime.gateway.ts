import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { RT, STAFF_ROLES, type Role } from '@mebel/shared';
import type { AccessPayload } from '../auth/token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from './realtime.service.js';

type AuthedSocket = Socket & { data: { userId: string; role: Role } };

/**
 * Socket.IO, namespace /rt. Ulanish: io(`${API}/rt`, { auth: { token: accessToken } }).
 * Token yo'q yoki yaroqsiz — ulanish uziladi.
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(ns: Namespace) {
    this.realtime.attach(ns);
  }

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    try {
      if (!token) throw new Error('no token');
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      const s = socket as AuthedSocket;
      s.data = { userId: payload.sub, role: payload.role };
      await s.join(rooms.user(payload.sub));
      if (STAFF_ROLES.includes(payload.role)) await s.join(rooms.staff);
      s.emit('ready', { userId: payload.sub, role: payload.role });
    } catch {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }

  /** Buyurtma sahifasi ochilganda — shu buyurtmaning chat va status hodisalari */
  @SubscribeMessage(RT.ORDER_SUBSCRIBE)
  async subscribe(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { orderId?: string }) {
    const orderId = body?.orderId;
    if (!orderId || !(await this.canAccess(socket.data, orderId))) return { ok: false, error: 'NOT_FOUND' };
    await socket.join(rooms.order(orderId));
    return { ok: true };
  }

  @SubscribeMessage(RT.ORDER_UNSUBSCRIBE)
  async unsubscribe(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { orderId?: string }) {
    if (body?.orderId) await socket.leave(rooms.order(body.orderId));
    return { ok: true };
  }

  private async canAccess(user: { userId: string; role: Role }, orderId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return false;
    if (user.role === 'MANAGER' || user.role === 'SUPER_ADMIN') return true;
    if (user.role !== 'CUSTOMER') return false;
    return (await this.prisma.order.count({ where: { id: orderId, customerId: user.userId } })) > 0;
  }
}
