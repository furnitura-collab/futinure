import { DropZone } from '@/components/dnd/DropZone';
import { SortableList } from '@/components/dnd/SortableList';
import { IconButton } from '@/components/IconButton';
import { SectionCard } from '@/components/SectionCard';
import { Star, Trash } from '@/components/icons';
import { useI18n } from '@/i18n';
import { api, fileUrl } from '@/lib/api';
import { useImageReorder } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import type { AdminProduct } from '@/lib/types';
import { cn } from '@/lib/utils';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ImagesCard({ product }: { product: AdminProduct }) {
  const { t } = useI18n();
  const invalidate = [['product', product.id], ['products']];
  const reorder = useImageReorder(product.id);
  const ids = product.images.map((i) => i.id);
  // Fayllar parallel yuklanadi; tartib tanlangan ketma-ketlikda, mavjud rasmlardan keyin
  const upload = useApiMutation(
    (files: File[]) =>
      Promise.all(
        files.map(async (file, i) => {
          const form = new FormData();
          form.set('file', file);
          const { url } = await api<{ url: string }>('/admin/uploads/images', { form });
          await api(`/admin/products/${product.id}/images`, { body: { url, sortOrder: product.images.length + i } });
        }),
      ),
    { invalidate, success: t('product.imageAdded') },
  );
  const remove = useApiMutation((imageId: string) => api(`/admin/products/${product.id}/images/${imageId}`, { method: 'DELETE' }), { invalidate });

  return (
    <SectionCard title={t('product.images')} contentClassName="grid gap-3">
      {product.images.length > 0 && (
        <SortableList
          layout="grid"
          className="grid grid-cols-3 gap-2"
          items={product.images}
          getId={(img) => img.id}
          onReorder={(next) => reorder.mutate(next)}
          renderItem={(img, handle) => {
            const main = img.id === ids[0];
            return (
              <div className="group relative overflow-hidden rounded-lg">
                <img
                  src={fileUrl(img.url)}
                  alt=""
                  draggable={false}
                  className={cn('aspect-square w-full rounded-lg object-cover ring-1', main ? 'ring-2 ring-primary' : 'ring-border')}
                />
                <div className="absolute top-1 left-1 rounded-md bg-background/80">{handle}</div>
                <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  {main ? (
                    <span />
                  ) : (
                    <IconButton
                      icon={Star}
                      size="icon-xs"
                      variant="secondary"
                      label={t('product.makeMain')}
                      onClick={() => reorder.mutate([img.id, ...ids.filter((id) => id !== img.id)])}
                    />
                  )}
                  <IconButton
                    icon={Trash}
                    size="icon-xs"
                    variant="secondary"
                    className="text-destructive"
                    label={t('common.delete')}
                    onClick={() => remove.mutate(img.id)}
                  />
                </div>
              </div>
            );
          }}
        />
      )}
      <DropZone
        accept={IMAGE_TYPES.join(',')}
        multiple
        disabled={upload.isPending}
        onFiles={(files) => {
          // Zonaga istalgan fayl tashlanishi mumkin — accept faqat tanlash oynasini cheklaydi
          const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
          if (images.length) upload.mutate(images);
        }}
        hint={t('product.imagesHint')}
        className="py-4"
      />
    </SectionCard>
  );
}
