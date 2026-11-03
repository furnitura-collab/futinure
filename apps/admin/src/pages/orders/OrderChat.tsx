import { useQuery } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useApiMutation } from '../../lib/mutation';
import type { ChatMessage } from '../../lib/types';
import { AuthFile } from '../../components/AuthFile';
import { Button, Card, cx, Input, Spinner } from '../../components/ui';

export function OrderChat({ orderId }: { orderId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['chat', orderId],
    queryFn: () => api<{ items: ChatMessage[]; hasMore: boolean }>(`/orders/${orderId}/messages`, { query: { limit: 100 } }),
  });
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const unreadFromCustomer = data?.items.some((m) => m.sender.role === 'CUSTOMER' && !m.readByStaffAt) ?? false;
  const markRead = useApiMutation(() => api(`/orders/${orderId}/messages/read`, { method: 'POST' }), {
    invalidate: [['orders']],
  });

  // Chat ochiq va yangi mijoz xabari bor — o'qilgan qilamiz
  useEffect(() => {
    if (unreadFromCustomer && !markRead.isPending) markRead.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadFromCustomer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.items.length]);

  const send = useApiMutation(
    async (vars: { text?: string; file?: File }) => {
      let attachmentUploadId: string | undefined;
      if (vars.file) {
        const form = new FormData();
        form.set('file', vars.file);
        attachmentUploadId = (await api<{ id: string }>('/uploads/chat', { form })).id;
      }
      return api(`/orders/${orderId}/messages`, { body: { text: vars.text, attachmentUploadId } });
    },
    { invalidate: [['chat', orderId]], onSuccess: () => setText('') },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) send.mutate({ text: text.trim() });
  };

  return (
    <Card title="Mijoz bilan chat">
      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {isPending && <Spinner />}
        {data?.items.length === 0 && <p className="text-sm text-stone-500">Hali xabar yo'q</p>}
        {data?.items.map((m) => {
          const mine = m.sender.role !== 'CUSTOMER';
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-stone-100')}>
                {!mine && <p className="mb-0.5 text-xs font-medium text-stone-500">{m.sender.fullName ?? 'Mijoz'}</p>}
                {mine && m.sender.fullName && <p className="mb-0.5 text-xs text-brand-100">{m.sender.fullName}</p>}
                {m.attachment && (
                  <div className="my-1">
                    <AuthFile path={`/chat/messages/${m.id}/attachment`} mimeType={m.attachment.mimeType} className="max-h-48 rounded-lg" />
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                <p className={cx('mt-1 text-right text-[11px]', mine ? 'text-brand-100' : 'text-stone-400')}>
                  {dateTime(m.createdAt)}
                  {mine && (m.readByCustomerAt ? ' · o\'qildi' : '')}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) send.mutate({ file });
            e.target.value = '';
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} title="Fayl biriktirish">
          <Paperclip className="size-4" />
        </Button>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Xabar yozing…" />
        <Button type="submit" loading={send.isPending} disabled={!text.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </Card>
  );
}
