import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { chatListQuerySchema, chatMessageInputSchema, type ChatListQuery, type ChatMessageInput } from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { PrivateFilesService } from '../uploads/private-files.service.js';
import { ChatService } from './chat.service.js';

const uuid = new ParseUUIDPipe();

/**
 * Mijoz va menejer bir xil yo'llardan foydalanadi: /orders/:id/messages.
 * Kim nimani ko'ra olishini ChatService tekshiradi.
 */
@Roles('CUSTOMER', 'MANAGER', 'SUPER_ADMIN')
@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly files: PrivateFilesService,
  ) {}

  @Get('orders/:id/messages')
  list(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @Query(new ZodPipe(chatListQuerySchema)) q: ChatListQuery) {
    return this.chat.list(id, u, q);
  }

  @Post('orders/:id/messages')
  send(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(chatMessageInputSchema)) body: ChatMessageInput) {
    return this.chat.send(id, u, body);
  }

  @Post('orders/:id/messages/read')
  @HttpCode(200)
  read(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.chat.markRead(id, u);
  }

  @Get('chat/messages/:id/attachment')
  async attachment(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    const file = await this.chat.attachment(id, u);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(this.files.open(file), { type: file.mimeType, disposition: 'inline' });
  }
}
