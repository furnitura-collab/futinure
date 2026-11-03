import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CUSTOMER_TYPES, PAYMENT_METHODS, type CustomerType, type PaymentMethod } from '@mebel/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePriceGroups } from '../../lib/catalog';
import { date, dateTime, phone, som } from '../../lib/format';
import { METHOD, STATUS } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { CustomerDetail, LedgerEntry, Paginated, Reconciliation } from '../../lib/types';
import { Badge, Button, Card, cx, Dialog, ErrorBox, Field, Input, PageHeader, PageLoader, Pagination, Select, Toggle } from '../../components/ui';
import { MoneyInput } from '../orders/TermsForm';
import { BalanceText, CUSTOMER_TYPE } from './CustomersPage';

const LEDGER_TYPE: Record<LedgerEntry['type'], string> = {
  DEBIT: 'Buyurtma',
  CREDIT: 'To\'lov',
  ADJUSTMENT: 'Tuzatish',
  REFUND: 'Qaytarildi',
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`),
  });
  if (isPending) return <PageLoader />;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  return <CustomerView key={data.id} customer={data} />;
}

function CustomerView({ customer: c }: { customer: CustomerDetail }) {
  const { can } = useAuth();
  const [tab, setTab] = useState<'ledger' | 'reconciliation'>('ledger');
  const [dialog, setDialog] = useState<'refund' | 'adjust' | null>(null);
  const f = c.finance;

  return (
    <div>
      <PageHeader
        title={c.customerProfile?.companyName || c.fullName || phone(c.phone)}
        back={
          <Link to="/customers" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200">
            <ArrowLeft className="size-5" />
          </Link>
        }
      >
        {can('SUPER_ADMIN') && (
          <>
            <Button variant="secondary" onClick={() => setDialog('adjust')}>Qo'lda tuzatish</Button>
            {f.balance < 0 && <Button variant="secondary" onClick={() => setDialog('refund')}>Pul qaytarish</Button>}
          </>
        )}
      </PageHeader>

      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Balans', <BalanceText key="b" value={f.balance} />],
              ['Kredit limiti', som(f.creditLimit)],
              ['Muddati o\'tgan', <span key="o" className={cx(f.overdueAmount > 0 && 'font-semibold text-rose-600')}>{som(f.overdueAmount)}</span>],
              ['Aylanma', som(c.stats.turnover)],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-stone-200 bg-white p-4">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-1 text-base">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-1 border-b border-stone-200">
            {(['ledger', 'reconciliation'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx('-mb-px border-b-2 px-4 py-2 text-sm font-medium', tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-500')}
              >
                {t === 'ledger' ? 'Hisob daftari' : 'Akt-sverka'}
              </button>
            ))}
          </div>
          {tab === 'ledger' ? <LedgerTable customerId={c.id} /> : <ReconciliationView customerId={c.id} />}

          <Card title="Oxirgi buyurtmalar">
            {c.recentOrders.length === 0 ? (
              <p className="text-sm text-stone-500">Buyurtma yo'q</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone-100">
                  {c.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 font-mono"><Link to={`/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link></td>
                      <td className="py-2"><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></td>
                      <td className="py-2 text-right">{som(o.grandTotal)}</td>
                      <td className="py-2 text-right text-stone-500">{o.dueDate ? `muddat ${date(o.dueDate)}` : ''}</td>
                      <td className="py-2 text-right text-stone-500">{date(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <ProfileCard customer={c} />
      </div>

      {dialog === 'refund' && <RefundDialog customer={c} onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && <AdjustDialog customer={c} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ProfileCard({ customer: c }: { customer: CustomerDetail }) {
  const { can } = useAuth();
  const groups = usePriceGroups();
  const p = c.customerProfile;
  const [fullName, setFullName] = useState(c.fullName ?? '');
  const [type, setType] = useState<CustomerType>(p?.type ?? 'INDIVIDUAL');
  const [companyName, setCompanyName] = useState(p?.companyName ?? '');
  const [inn, setInn] = useState(p?.inn ?? '');
  const [priceGroupId, setPriceGroupId] = useState(p?.priceGroupId ?? '');
  const [creditLimit, setCreditLimit] = useState(p?.creditLimit ?? 0);
  const [termDays, setTermDays] = useState(String(p?.paymentTermDays ?? 0));
  const [methods, setMethods] = useState<PaymentMethod[]>(p?.allowedPaymentMethods ?? ['CASH']);
  const [isActive, setIsActive] = useState(c.isActive);
  const admin = can('SUPER_ADMIN');

  const save = useApiMutation(
    () =>
      api(`/admin/customers/${c.id}`, {
        method: 'PATCH',
        body: {
          fullName: fullName.trim() || undefined,
          type,
          companyName: companyName.trim() || null,
          inn: inn.trim() || null,
          priceGroupId: priceGroupId || null,
          allowedPaymentMethods: methods,
          isActive,
          ...(admin && { creditLimit, paymentTermDays: Number(termDays) || 0 }),
        },
      }),
    { invalidate: [['customer', c.id], ['customers']], success: 'Saqlandi' },
  );

  return (
    <Card title="Profil">
      <div className="space-y-4">
        <p className="text-sm">
          <a href={`tel:${c.phone}`} className="text-brand-700 hover:underline">{phone(c.phone)}</a>
          <span className="text-stone-500"> · {c.locale === 'ru' ? 'rus tili' : 'o\'zbek tili'} · {dateTime(c.createdAt)} dan</span>
        </p>
        <Field label="Ism">{(id) => <Input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turi">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE[t]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Narx guruhi">
            {(id) => (
              <Select id={id} value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)}>
                <option value="">Chakana</option>
                {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {type === 'COMPANY' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Firma nomi">{(id) => <Input id={id} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />}</Field>
            <Field label="STIR">{(id) => <Input id={id} inputMode="numeric" maxLength={9} value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))} />}</Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kredit limiti" hint={admin ? undefined : 'Faqat super admin'}>
            {(id) => (admin ? <MoneyInput id={id} value={creditLimit} onChange={setCreditLimit} /> : <Input id={id} disabled value={som(creditLimit)} />)}
          </Field>
          <Field label="Nasiya muddati, kun">
            {(id) => <Input id={id} disabled={!admin} inputMode="numeric" value={termDays} onChange={(e) => setTermDays(e.target.value.replace(/\D/g, ''))} />}
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700">Ruxsat etilgan to'lov usullari</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => {
              const on = methods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethods(on ? methods.filter((x) => x !== m) : [...methods, m])}
                  className={cx('rounded-full px-3 py-1 text-xs ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-stone-600 ring-stone-300')}
                >
                  {METHOD[m]}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle checked={isActive} onChange={setIsActive} label={isActive ? 'Faol' : 'Bloklangan (kira olmaydi)'} />
        <Button className="w-full" loading={save.isPending} disabled={!methods.length || (type === 'COMPANY' && inn !== '' && inn.length !== 9)} onClick={() => save.mutate(undefined)}>
          Saqlash
        </Button>
      </div>
    </Card>
  );
}

function LedgerTable({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useQuery({
    queryKey: ['ledger', customerId, page],
    queryFn: () => api<Paginated<LedgerEntry>>(`/admin/customers/${customerId}/ledger`, { query: { page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });
  if (isPending || !data) return <PageLoader />;
  if (!data.items.length) return <p className="text-sm text-stone-500">Yozuv yo'q</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2">Sana</th>
              <th className="px-4 py-2">Turi</th>
              <th className="px-4 py-2">Izoh</th>
              <th className="px-4 py-2 text-right">Summa</th>
              <th className="px-4 py-2 text-right">Qoldiq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap text-stone-500">{dateTime(e.createdAt)}</td>
                <td className="px-4 py-2">{LEDGER_TYPE[e.type]}</td>
                <td className="px-4 py-2">
                  {e.order ? <Link to={`/orders/${e.order.id}`} className="text-brand-700 hover:underline">{e.description}</Link> : e.description}
                </td>
                <td className={cx('px-4 py-2 text-right font-medium whitespace-nowrap', e.amount > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                  {e.amount > 0 ? '+' : '−'}{som(Math.abs(e.amount))}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap"><BalanceText value={e.balanceAfter} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </div>
  );
}

function ReconciliationView({ customerId }: { customerId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const { data, isPending, error } = useQuery({
    queryKey: ['reconciliation', customerId, from, to],
    queryFn: () => api<Reconciliation>(`/admin/customers/${customerId}/reconciliation`, { query: { from, to } }),
    enabled: from <= to,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Dan">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Gacha">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Chop etish</Button>
      </div>
      {from > to ? (
        <p className="text-sm text-rose-600">Davr boshi oxiridan keyin bo'lmasin</p>
      ) : error ? (
        <ErrorBox error={error} />
      ) : isPending || !data ? (
        <PageLoader />
      ) : (
        <div id="print-area" className="rounded-xl border border-stone-200 bg-white p-6 text-sm">
          <h3 className="text-center text-base font-semibold">O'zaro hisob-kitob dalolatnomasi (akt-sverka)</h3>
          <p className="mt-1 text-center text-stone-600">
            {data.customer.customerProfile?.companyName || data.customer.fullName}
            {data.customer.customerProfile?.inn && `, STIR ${data.customer.customerProfile.inn}`} · {date(data.period.from)} — {date(data.period.to)}
          </p>
          <table className="mt-4 w-full">
            <thead className="border-b border-stone-300 text-left text-xs text-stone-500">
              <tr>
                <th className="py-2">Sana</th>
                <th className="py-2">Hujjat</th>
                <th className="py-2 text-right">Debet (qarz)</th>
                <th className="py-2 text-right">Kredit (to'lov)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100 font-medium">
                <td className="py-2" colSpan={2}>Davr boshidagi qoldiq</td>
                <td className="py-2 text-right" colSpan={2}><BalanceText value={data.openingBalance} /></td>
              </tr>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-stone-100">
                  <td className="py-1.5">{date(e.createdAt)}</td>
                  <td className="py-1.5">{e.description}</td>
                  <td className="py-1.5 text-right">{e.amount > 0 ? som(e.amount) : ''}</td>
                  <td className="py-1.5 text-right">{e.amount < 0 ? som(-e.amount) : ''}</td>
                </tr>
              ))}
              <tr className="border-b border-stone-300 font-medium">
                <td className="py-2" colSpan={2}>Aylanma</td>
                <td className="py-2 text-right">{som(data.totalDebit)}</td>
                <td className="py-2 text-right">{som(data.totalCredit)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2" colSpan={2}>Davr oxiridagi qoldiq</td>
                <td className="py-2 text-right" colSpan={2}><BalanceText value={data.closingBalance} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RefundDialog({ customer: c, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [amount, setAmount] = useState(-c.finance.balance);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [description, setDescription] = useState('');
  const save = useApiMutation(() => api(`/admin/customers/${c.id}/refunds`, { body: { amount, method, description: description.trim() } }), {
    invalidate: [['customer', c.id], ['ledger', c.id], ['customers']],
    success: 'Qaytarildi',
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Pul qaytarish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={save.isPending} disabled={amount <= 0 || amount > -c.finance.balance || description.trim().length < 5} onClick={() => save.mutate(undefined)}>
            Qaytarish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">Mijoz haqi: {som(-c.finance.balance)}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Summa">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
          <Field label="Usul">
            {(id) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD[m]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Izoh (majburiy)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Masalan: bekor qilingan MO-... avansi" />}</Field>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ customer: c, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const save = useApiMutation(
    () => api(`/admin/customers/${c.id}/ledger/adjust`, { body: { amount: sign * amount, description: description.trim() } }),
    { invalidate: [['customer', c.id], ['ledger', c.id], ['customers']], success: 'Tuzatish yozildi', onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Hisob daftarini qo'lda tuzatish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={save.isPending} disabled={amount <= 0 || description.trim().length < 5} onClick={() => save.mutate(undefined)}>Yozish</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Masalan, eski daftardagi qarzni tizimga kiritish. Yozuv o'chirilmaydi — xato bo'lsa teskari tuzatish yoziladi.
        </p>
        <div className="flex rounded-lg bg-stone-100 p-1">
          {([1, -1] as const).map((s) => (
            <button key={s} onClick={() => setSign(s)} className={cx('flex-1 rounded-md py-1.5 text-sm font-medium', sign === s ? 'bg-white shadow-sm' : 'text-stone-500')}>
              {s === 1 ? 'Qarzni oshirish' : 'Qarzni kamaytirish'}
            </button>
          ))}
        </div>
        <Field label="Summa">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Izoh (majburiy)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
