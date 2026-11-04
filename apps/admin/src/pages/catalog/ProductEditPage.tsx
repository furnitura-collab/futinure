import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import type { AdminProduct } from '@/lib/types';
import { ImagesCard } from './ImagesCard';
import { BasicsCard, DescriptionCard, SalesRulesCard } from './ProductFormCards';
import { isFormValid, toForm, toPayload, type ProductForm, type SetField } from './productForm';
import { VariantsCard } from './VariantsCard';

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<AdminProduct>(`/admin/products/${id}`),
    enabled: !isNew,
  });
  if (!isNew && isPending) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  // key — boshqa mahsulotga o'tganda forma qayta boshlanadi
  return <ProductEditor key={data?.id ?? 'new'} product={isNew ? undefined : data} />;
}

function ProductEditor({ product }: { product?: AdminProduct }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [form, setForm] = useState<ProductForm>(() => toForm(product));
  const [deleting, setDeleting] = useState(false);
  const set: SetField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = useApiMutation(
    () =>
      product
        ? api<AdminProduct>(`/admin/products/${product.id}`, { method: 'PATCH', body: toPayload(form) })
        : api<AdminProduct>('/admin/products', { body: toPayload(form) }),
    {
      invalidate: [['products'], ['product', product?.id]],
      success: product ? t('common.saved') : t('product.created'),
      onSuccess: (p) => {
        if (!product) navigate(`/catalog/${p.id}`, { replace: true });
      },
    },
  );
  const remove = useApiMutation(() => api(`/admin/products/${product?.id}`, { method: 'DELETE' }), {
    invalidate: [['products']],
    success: t('common.deleted'),
    onSuccess: () => navigate('/catalog'),
  });

  return (
    <div>
      <PageHeader back={{ to: '/catalog', label: t('catalog.title') }} title={product ? product.nameUz : t('product.newTitle')}>
        {product && can('SUPER_ADMIN') && (
          <Button variant="ghost-destructive" onClick={() => setDeleting(true)}>
            <Trash2 /> {t('common.delete')}
          </Button>
        )}
        <Button loading={save.isPending} disabled={!isFormValid(form)} onClick={() => save.mutate(undefined)}>
          {t('common.save')}
        </Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <BasicsCard form={form} set={set} />
          <SalesRulesCard form={form} set={set} />
          {product && <VariantsCard product={product} />}
        </div>
        <div className="min-w-0 space-y-6">
          {product && <ImagesCard product={product} />}
          <DescriptionCard form={form} set={set} />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('product.deleteTitle')}
        description={t('product.deleteText')}
        confirmLabel={t('common.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </div>
  );
}
