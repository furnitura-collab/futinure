import { useState } from 'react';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { SwitchField } from '@/components/SwitchField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { flattenCategories, slugify } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import type { Category } from '@/lib/types';

export function CategoryDialog({
  category,
  defaultParentId = null,
  all,
  onClose,
}: {
  category: Category | null;
  defaultParentId?: string | null;
  all: Category[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [nameUz, setNameUz] = useState(category?.nameUz ?? '');
  const [nameRu, setNameRu] = useState(category?.nameRu ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [parentId, setParentId] = useState(category?.parentId ?? defaultParentId ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const save = useApiMutation(
    () => {
      const parent = parentId || null;
      // Tartib sudrab o'zgartiriladi; yangi yoki boshqa otaga ko'chgan kategoriya ro'yxat oxiriga tushadi
      const sortOrder =
        category && category.parentId === parent
          ? category.sortOrder
          : all.filter((c) => c.parentId === parent && c.id !== category?.id).reduce((m, c) => Math.max(m, c.sortOrder + 1), 0);
      const body = { nameUz: nameUz.trim(), nameRu: nameRu.trim(), slug, parentId: parent, sortOrder, isActive };
      return category ? api(`/admin/categories/${category.id}`, { method: 'PATCH', body }) : api('/admin/categories', { body });
    },
    { invalidate: [['categories']], success: t('common.saved'), onSuccess: onClose },
  );
  // O'zini ota sifatida tanlab bo'lmaydi (avlodlarini backend tekshiradi)
  const options = flattenCategories(all).filter((c) => c.id !== category?.id);

  return (
    <FormDialog
      onClose={onClose}
      title={category ? t('categories.editTitle') : t('categories.newTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!nameUz.trim() || !nameRu.trim() || !slug} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label={t('product.nameUz')}>
          {(f) => (
            <Input
              {...f}
              autoFocus
              value={nameUz}
              onChange={(e) => {
                setNameUz(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          )}
        </FormField>
        <FormField label={t('product.nameRu')}>{(f) => <Input {...f} value={nameRu} onChange={(e) => setNameRu(e.target.value)} />}</FormField>
        <FormField label={t('categories.slug')}>
          {(f) => (
            <Input
              {...f}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          )}
        </FormField>
        <FormField label={t('categories.parent')}>
          {(f) => (
            <OptionSelect
              {...f}
              value={parentId}
              onValueChange={setParentId}
              emptyLabel={t('categories.topLevel')}
              options={options.map((c) => ({ value: c.id, label: c.label }))}
            />
          )}
        </FormField>
        <SwitchField checked={isActive} onCheckedChange={setIsActive} label={t('categories.activeLabel')} />
      </div>
    </FormDialog>
  );
}
