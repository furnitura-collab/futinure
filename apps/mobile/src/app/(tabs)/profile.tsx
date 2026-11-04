import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatPhone } from '@mebel/shared';
import { BalanceCard } from '@/components/profile/BalanceCard';
import { SettingsSections } from '@/components/settings/SettingsSections';
import { Appear, Avatar, Button, Card, CountBadge, ListGroup, ListItem, Screen, Skeleton, Text } from '@/components/ui';
import { TwoColumn } from '@/components/web/TwoColumn';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import type { Balance } from '@/lib/types';
import { radius, space } from '@/theme';

export default function Profile() {
  const { me } = useAuth();
  const { t, customerType } = useI18n();
  const { site } = useSite();
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance') });
  const unread = useUnreadCount();
  const p = me?.customerProfile;
  const b = balance.data;

  const account = (
    <Appear key="account">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
        <Avatar name={me?.fullName} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="heading" numberOfLines={1}>{me?.fullName}</Text>
          <Text v="small" muted numberOfLines={2}>
            {[p?.companyName ?? (p && customerType(p.type)), me && formatPhone(me.phone)].filter(Boolean).join(' · ')}
          </Text>
          {p?.priceGroup && <Text v="caption" tone="primary">{t('priceGroupLine', { name: p.priceGroup.name })}</Text>}
        </View>
      </Card>
    </Appear>
  );
  const money = (
    <Appear key="balance" index={1}>
      {b ? (
        <BalanceCard b={b}>
          {b.balance - b.pendingPayments > 0 && <Button title={t('payDebt')} icon="card-outline" size="md" onPress={() => router.push('/pay')} />}
        </BalanceCard>
      ) : (
        <Skeleton height={120} radius={radius.lg} />
      )}
    </Appear>
  );
  const links = (
    <Appear key="links" index={2}>
      <ListGroup title={t('account')}>
        <ListItem icon="notifications-outline" title={t('notifications')} right={<CountBadge count={unread} />} onPress={() => router.push('/notifications')} />
        <ListItem icon="location-outline" title={t('addresses')} onPress={() => router.push('/addresses')} />
        <ListItem icon="document-text-outline" title={t('paymentsHistory')} onPress={() => router.push('/balance')} />
      </ListGroup>
    </Appear>
  );
  const settings = (
    <Appear key="settings" index={3} style={{ gap: space(4) }}>
      <SettingsSections />
    </Appear>
  );

  return (
    <Screen width="form" title={t('tabProfile')}>
      {site ? (
        // Saytda: chapda hisob va balans, o'ngda — sozlamalar guruhlari
        <TwoColumn sticky={false} aside={[links, settings]}>
          {account}
          {money}
        </TwoColumn>
      ) : (
        [account, money, links, settings]
      )}
    </Screen>
  );
}
