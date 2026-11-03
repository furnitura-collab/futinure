import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Input, Row, Text } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, space } from '../lib/theme';

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
    .filter((p) => p.length >= 2 && p[0])
    .map(([sku, qty]) => ({ sku: sku!, qty: qty!.replace(',', '.') }));

  const add = useApiMutation(() => api<{ results: Result[] }>('/cart/items/bulk', { body: { items } }), {
    invalidate: [['cart']],
    onSuccess: (r) => setResults(r.results),
  });
  const allOk = results?.every((r) => r.status === 'ADDED');

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }} keyboardShouldPersistTaps="handled">
      <Input
        label={t('quickSku')}
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
        style={{ height: 180, fontFamily: 'monospace' }}
      />
      {results ? (
        <View style={{ gap: space(2) }}>
          {results.map((r, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'monospace' }}>{r.sku}</Text>
              <Text v="small" color={r.status === 'ADDED' ? colors.success : colors.danger}>
                {r.status === 'ADDED' ? `✓ ${r.qty}` : errorText(r.status, r.status === 'NOT_FOUND' ? '?' : r.status)}
              </Text>
            </Row>
          ))}
          <Button title={t('tabCart')} variant={allOk ? 'primary' : 'secondary'} onPress={() => router.replace('/cart')} />
        </View>
      ) : (
        <Button title={t('addToCart')} icon="cart" disabled={!items.length} loading={add.isPending} onPress={() => add.mutate(undefined)} />
      )}
    </ScrollView>
  );
}
