import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { ActionCards } from '@/components/home/ActionCards';
import { ActiveOrdersRail } from '@/components/home/ActiveOrdersRail';
import { BuyAgainRail } from '@/components/home/BuyAgainRail';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PopularProducts } from '@/components/home/PopularProducts';
import { QuickOrderCard } from '@/components/home/QuickOrderCard';
import { SearchEntry } from '@/components/home/SearchEntry';
import { Appear, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useLayout, useSite } from '@/lib/layout';
import { space } from '@/theme';

/** Bosh sahifa: "hozir nima qilishim kerak" — harakatlar, faol buyurtmalar, tez qayta buyurtma */
export default function Home() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { wide } = useLayout();
  const { site } = useSite();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all(['orders', 'buy-again', 'categories', 'products', 'balance', 'notifications'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    setRefreshing(false);
  };

  return (
    <Screen title={t('tabHome')} heading={false} refreshing={refreshing} onRefresh={() => void refresh()} contentStyle={{ gap: space(site ? 8 : 5) }}>
      {site ? (
        // Saytda qidiruv sarlavhada; salomlashish ixcham, "sizdan kutilmoqda" — to'liq kenglikda ustunlar
        <View style={{ gap: space(6) }}>
          <Appear>
            <HomeHeader />
          </Appear>
          <ActionCards columns={3} />
        </View>
      ) : (
        <>
          <Appear style={{ gap: space(4) }}>
            <HomeHeader />
            <SearchEntry />
          </Appear>
          <ActionCards />
        </>
      )}
      <ActiveOrdersRail />
      <BuyAgainRail />
      <CategoryGrid columns={site ? 4 : wide ? 3 : 2} />
      <PopularProducts columns={site ? 5 : wide ? 3 : 2} />
      <QuickOrderCard />
    </Screen>
  );
}
