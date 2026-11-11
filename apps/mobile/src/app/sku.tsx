import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Icon, Input, Row, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

interface Result {
  sku: string;
  status: string;
  qty?: string;
}

/**
 * Ustalar uchun tez buyurtma: har qatorda "ARTIKUL MIQDOR".
 * Masalan:
 *   KR-W980-16 12
 *   RH-2-W980 25.5
 */
export default function Sku() {
  const { t, errorText } = useI18n();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);

  const items = text
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((p): p is [string, string, ...string[]] => p.length >= 2 && !!p[0])
    .map(([sku, qty]) => ({ sku, qty: qty.replace(',', '.') }));

  const add = useApiMutation(() => api<{ results: Result[] }>('/cart/items/bulk', { body: { items } }), {
    invalidate: [['cart']],
    onSuccess: (r) => setResults(r.results),
  });
  const allOk = results?.every((r) => r.status === 'ADDED');

  return (
    <Screen width="form" modal title={t('quickSku')}>
      <Card tone="primary" style={{ gap: space(1) }}>
        <Row gap={space(2)}>
          <Text v="small" bold tone="primary">{t('skuHowTitle')}</Text>
        </Row>
        <Text v="small">{t('quickSkuExplain')}</Text>
      </Card>
      <Input
        label={t('skuInputLabel')}
        hint={t('quickSkuHint')}
        multiline
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setResults(null);
        }}
        placeholder={'KR-W980-16 12\nRH-2-W980 25.5'}
        style={{ minHeight: 180, fontFamily: 'monospace' }}
      />
      {results ? (
        <>
          <Card style={{ gap: space(3) }}>
            {results.map((r, i) => {
              const ok = r.status === 'ADDED';
              return (
                <Row key={i} between>
                  <Text style={{ fontFamily: 'monospace', flex: 1 }} numberOfLines={1}>{r.sku}</Text>
                  <Row gap={6}>
                    <Icon name={ok ? 'checkmark-circle' : 'close-circle'} size={16} tone={ok ? 'success' : 'destructive'} />
                    <Text v="small" tone={ok ? 'success' : 'destructive'}>
                      {ok ? t('skuAdded', { qty: r.qty ?? '' }) : r.status === 'NOT_FOUND' ? t('skuNotFound') : errorText(r.status, r.status)}
                    </Text>
                  </Row>
                </Row>
              );
            })}
          </Card>
          <Button title={t('goToCart')} variant={allOk ? 'primary' : 'outline'} block onPress={() => router.navigate('/cart')} />
        </>
      ) : (
        <Button
          title={items.length ? t('skuAddN', { n: items.length }) : t('addToCart')}
          block
          disabled={!items.length}
          loading={add.isPending}
          onPress={() => add.mutate(undefined)}
        />
      )}
    </Screen>
  );
}
