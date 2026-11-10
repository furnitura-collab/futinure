import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { AdminProduct } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ImagesCard({ product }: { product: AdminProduct }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = [['product', product.id], ['products']];
  const upload = useApiMutation(
    async (files: File[]) => {
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        const { url } = await api<{ url: string }>('/admin/uploads/images', { form });
        await api(`/admin/products/${product.id}/images`, { body: { url, sortOrder: product.images.length } });
      }
    },
    { invalidate, success: t('product.imageAdded') },
  );
  const remove = useApiMutation((imageId: string) => api(`/admin/products/${product.id}/images/${imageId}`, { method: 'DELETE' }), { invalidate });
  const makeMain = useApiMutation(
    (imageId: string) =>
      api(`/admin/products/${product.id}/images/order`, {
        method: 'PUT',
        body: { ids: [imageId, ...product.images.filter((i) => i.id !== imageId).map((i) => i.id)] },
      }),
    { invalidate },
  );

  return (
    <SectionCard
      title={t('product.images')}
      actions={
        <Button size="sm" variant="outline" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
          <ImagePlus /> {t('product.upload')}
        </Button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) upload.mutate(files);
          e.target.value = '';
        }}
      />
      {product.images.length === 0 ? (
        <EmptyState icon={ImagePlus} title={t('product.noImages')} className="py-6" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {product.images.map((img, i) => (
            <div key={img.id} className="group relative overflow-hidden rounded-lg">
              <img
                src={fileUrl(img.url)}
                alt=""
                className={cn('aspect-square w-full rounded-lg object-cover ring-1 transition-transform duration-200 group-hover:scale-[1.03]', i === 0 ? 'ring-2 ring-primary' : 'ring-border')}
              />
              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                {i > 0 ? (
                  <Button size="icon-xs" variant="secondary" title={t('product.makeMain')} aria-label={t('product.makeMain')} onClick={() => makeMain.mutate(img.id)}>
                    <Star />
                  </Button>
                ) : (
                  <span />
                )}
                <Button size="icon-xs" variant="secondary" className="text-destructive" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => remove.mutate(img.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
