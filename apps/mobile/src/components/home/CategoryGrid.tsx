import { router } from 'expo-router';
import { View } from 'react-native';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { PressableScale, SectionHeader, Skeleton, Text } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { useI18n } from '@/i18n';
import { useCategories } from '@/lib/categories';
import { makeStyles, radius, space, useTheme } from '@/theme';

/** Kategoriyalar — belgi, nom va mahsulotlar soni (IKEA kabi vizual kirish) */
export function CategoryGrid({ columns }: { columns: number }) {
  const { t, name } = useI18n();
  const s = useStyles();
  const q = useCategories();
  const { shadowLg } = useTheme();

  return (
    <View style={{ gap: space(3) }}>
      <SectionHeader title={t('categories')} action={t('allProducts')} onAction={() => router.navigate({ pathname: '/catalog', params: { categoryId: '' } })} />
      <Grid columns={columns}>
        {(q.data ?? Array.from({ length: 4 }, () => null)).map((c, i) =>
          c ? (
            <PressableScale
              key={c.id}
              onPress={() => router.navigate({ pathname: '/catalog', params: { categoryId: c.id } })}
              scale={0.97}
              accessibilityRole="button"
              accessibilityLabel={`${name(c)}, ${t('productsCount', { n: c.productCount })}`}
              hoverStyle={[shadowLg, { top: -2 }]}
              style={s.tile}
            >
              <View style={s.art}>
                <CategoryArt categoryId={c.id} iconSize={22} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text v="small" bold numberOfLines={2}>{name(c)}</Text>
                <Text v="caption">{t('productsCount', { n: c.productCount })}</Text>
              </View>
            </PressableScale>
          ) : (
            <Skeleton key={i} height={72} radius={radius.lg} />
          ),
        )}
      </Grid>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 72,
    padding: space(3),
    borderRadius: radius.lg,
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.shadow,
  },
  art: { width: 48, height: 48, borderRadius: radius.md, overflow: 'hidden' },
}));
