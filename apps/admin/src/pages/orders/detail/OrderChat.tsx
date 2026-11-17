import { useQuery } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDateTime } from '@mebel/shared';
import { AuthFile } from '@/components/AuthFile';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

export function OrderChat({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const { data, isPending } = useQuery({
    queryKey: ['chat', orderId],
    queryFn: () => api<{ items: ChatMessage[]; hasMore: boolean }>(`/orders/${orderId}/messages`, { query: { limit: 100 } }),
  });
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const unreadFromCustomer = data?.items.some((m) => m.sender.role === 'CUSTOMER' && !m.readByStaffAt) ?? false;
  const markRead = useApiMutation(() => api(`/orders/${orderId}/messages/read`, { method: 'POST' }), {
    invalidate: [['orders']],
  });

  // Chat ochiq va yangi mijoz xabari bor — o'qilgan qilamiz
  useEffect(() => {
    if (unreadFromCustomer && !markRead.isPending) markRead.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadFromCustomer]);

  // Sahifani emas, faqat chat ro'yxatini pastga suramiz
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
    <SectionCard title={t('chat.title')} flush>
      <div ref={listRef} className="max-h-96 min-h-32 space-y-3 overflow-y-auto p-5 scroll-smooth">
        {isPending && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        )}
        {data?.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('chat.empty')}</p>}
        {data?.items.map((m) => {
          const mine = m.sender.role !== 'CUSTOMER';
          return (
            <div key={m.id} className={cn('flex animate-fade-up', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-xs',
                  mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
                )}
              >
                <p className={cn('mb-0.5 text-xs font-medium', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {m.sender.fullName ?? (mine ? '' : t('chat.customer'))}
                </p>
                {m.attachment && (
                  <div className="my-1">
                    <AuthFile path={`/chat/messages/${m.id}/attachment`} mimeType={m.attachment.mimeType} className="max-h-48" />
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                <p className={cn('mt-1 text-right text-[11px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {formatDateTime(m.createdAt)}
                  {mine && m.readByCustomerAt && ` · ${t('chat.read')}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
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
        <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label={t('chat.attach')} title={t('chat.attach')}>
          <Paperclip />
        </Button>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} />
        <Button type="submit" size="icon" loading={send.isPending} disabled={!text.trim()} aria-label={t('chat.send')}>
          {!send.isPending && <Send />}
        </Button>
      </form>
    </SectionCard>
  );
}
