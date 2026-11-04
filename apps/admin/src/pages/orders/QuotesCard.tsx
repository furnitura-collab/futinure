import { formatDateTime } from '@mebel/shared';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { TONE_TEXT, type Tone } from '@/components/tone';
import { useI18n } from '@/i18n';
import type { QuoteView } from '@/lib/types';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<Exclude<QuoteView['lines'][number]['action'], 'KEEP'>, Tone> = {
  CHANGE: 'warning',
  REMOVE: 'destructive',
  REPLACE: 'violet',
  ADD: 'success',
};

function QuoteCard({ quote: q }: { quote: QuoteView }) {
  const { t, money, label } = useI18n();
  const pending = q.status === 'PENDING';
  return (
    <div className={cn('rounded-lg border p-4 transition-colors', pending ? 'border-violet/40 bg-violet/5' : 'bg-card')}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{t('order.quoteVersion', { v: q.version })}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge kind="quoteStatus" value={q.status} />
          {formatDateTime(q.createdAt)}
          {pending && ` · ${t('order.until', { date: formatDateTime(q.expiresAt) })}`}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {q.lines.map((l, i) =>
          l.action === 'KEEP' ? null : (
            <li key={i} className={cn(TONE_TEXT[ACTION_TONE[l.action]], l.action === 'REMOVE' && 'line-through')}>
              <span className="mr-1 text-xs font-semibold uppercase">{t(`order.quoteAction.${l.action}`)}:</span>
              {l.action === 'REPLACE' && l.replaces && `${l.replaces.nameUz} → `}
              {l.nameUz} · {l.oldQty && l.oldQty !== l.qty ? `${l.oldQty} → ` : ''}
              {l.qty} × {money(l.unitPrice)}
            </li>
          ),
        )}
      </ul>
      <p className="mt-2 text-sm">
        {t('order.grandTotal')}: <span className="font-semibold tabular">{money(q.totals.grandTotal)}</span> · {label('paymentTerms', q.paymentTerms)}
        {q.paymentTerms === 'ADVANCE' && ` ${money(q.advanceAmount)}`}
      </p>
      {q.managerNote && <p className="mt-1 text-xs text-muted-foreground">{t('order.managerNote', { text: q.managerNote })}</p>}
      {q.customerComment && <p className="mt-1 text-xs text-destructive">{t('order.customerNote', { text: q.customerComment })}</p>}
    </div>
  );
}

export function QuotesCard({ quotes }: { quotes: QuoteView[] }) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('order.quotes')} contentClassName="space-y-3">
      {quotes.map((q) => (
        <QuoteCard key={q.id} quote={q} />
      ))}
    </SectionCard>
  );
}
