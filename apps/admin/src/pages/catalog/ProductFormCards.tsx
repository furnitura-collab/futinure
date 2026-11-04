import { PRODUCT_KINDS, UNITS, type ProductKind, type Unit } from '@mebel/shared';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { SectionCard } from '@/components/SectionCard';
import { SwitchField } from '@/components/SwitchField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { flattenCategories, useBrands, useCategories } from '@/lib/catalog';
import type { ProductForm, SetField } from './productForm';

const isKind = (v: string): v is ProductKind => (PRODUCT_KINDS as readonly string[]).includes(v);
const isUnit = (v: string): v is Unit => (UNITS as readonly string[]).includes(v);

type Props = { form: ProductForm; set: SetField };

export function BasicsCard({ form, set }: Props) {
  const { t } = useI18n();
  const categories = useCategories();
  const brands = useBrands();
  return (
    <SectionCard title={t('product.basics')} contentClassName="grid gap-4 sm:grid-cols-2">
      <FormField label={t('product.nameUz')}>{(f) => <Input {...f} value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} />}</FormField>
      <FormField label={t('product.nameRu')}>{(f) => <Input {...f} value={form.nameRu} onChange={(e) => set('nameRu', e.target.value)} />}</FormField>
      <FormField label={t('catalog.category')}>
        {(f) => (
          <OptionSelect
            {...f}
            value={form.categoryId}
            onValueChange={(v) => set('categoryId', v)}
            placeholder={t('common.choose')}
            options={flattenCategories(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
          />
        )}
      </FormField>
      <FormField label={t('product.brand')}>
        {(f) => (
          <OptionSelect
            {...f}
            value={form.brandId}
            onValueChange={(v) => set('brandId', v)}
            emptyLabel="—"
            options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
      </FormField>
      <FormField label={t('product.code')} hint={t('product.codeHint')}>
        {(f) => <Input {...f} value={form.code} onChange={(e) => set('code', e.target.value)} />}
      </FormField>
      <FormField label={t('product.kind')}>
        {(f) => (
          <OptionSelect
            {...f}
            value={form.kind}
            onValueChange={(v) => isKind(v) && set('kind', v)}
            options={PRODUCT_KINDS.map((k) => ({ value: k, label: t(`product.kinds.${k}`) }))}
          />
        )}
      </FormField>
    </SectionCard>
  );
}

export function SalesRulesCard({ form, set }: Props) {
  const { t, label } = useI18n();
  return (
    <SectionCard title={t('product.rules')}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <FormField label={t('product.unit')}>
          {(f) => (
            <OptionSelect
              {...f}
              value={form.unit}
              onValueChange={(v) => isUnit(v) && set('unit', v)}
              options={UNITS.map((u) => ({ value: u, label: label('unit', u) }))}
            />
          )}
        </FormField>
        <FormField label={t('product.minQty')}>{(f) => <Input {...f} inputMode="decimal" value={form.minQty} onChange={(e) => set('minQty', e.target.value)} />}</FormField>
        <FormField label={t('product.qtyStep')} hint={t('product.qtyStepHint')}>
          {(f) => <Input {...f} inputMode="decimal" value={form.qtyStep} onChange={(e) => set('qtyStep', e.target.value)} />}
        </FormField>
        <FormField label={t('product.weight')}>{(f) => <Input {...f} inputMode="decimal" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />}</FormField>
        <FormField label={t('product.volume')}>{(f) => <Input {...f} inputMode="decimal" value={form.volumeM3} onChange={(e) => set('volumeM3', e.target.value)} />}</FormField>
        {form.kind === 'BOARD' && (
          <>
            <FormField label={t('product.length')}>
              {(f) => <Input {...f} inputMode="numeric" value={form.boardLengthMm} onChange={(e) => set('boardLengthMm', e.target.value)} />}
            </FormField>
            <FormField label={t('product.width')}>
              {(f) => <Input {...f} inputMode="numeric" value={form.boardWidthMm} onChange={(e) => set('boardWidthMm', e.target.value)} />}
            </FormField>
          </>
        )}
        <FormField label={t('product.thickness')}>
          {(f) => <Input {...f} inputMode="decimal" value={form.thicknessMm} onChange={(e) => set('thicknessMm', e.target.value)} />}
        </FormField>
      </div>
      <SwitchField className="mt-4" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} label={t('product.isActive')} />
    </SectionCard>
  );
}

export function DescriptionCard({ form, set }: Props) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('product.description')} contentClassName="grid gap-4">
      <FormField label={t('product.descUz')}>
        {(f) => <Textarea {...f} rows={4} value={form.descriptionUz} onChange={(e) => set('descriptionUz', e.target.value)} />}
      </FormField>
      <FormField label={t('product.descRu')}>
        {(f) => <Textarea {...f} rows={4} value={form.descriptionRu} onChange={(e) => set('descriptionRu', e.target.value)} />}
      </FormField>
    </SectionCard>
  );
}
