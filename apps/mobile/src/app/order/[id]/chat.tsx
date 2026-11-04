import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { MessageBubble } from '@/components/order/MessageBubble';
import { EmptyState, IconButton, Screen, SkeletonList } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fileToForm } from '@/lib/api';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import { useOrderRoom } from '@/lib/realtime';
import type { ChatMessage, OrderDetail } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { site } = useSite();
  useOrderRoom(id);
  const list = useRef<FlatList<ChatMessage>>(null);
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['chat', id],
    queryFn: () => api<{ items: ChatMessage[] }>(`/orders/${id}/messages`, { query: { limit: 100 } }),
  });

  // Saytdagi yo'l uchun raqam — odatda buyurtma sahifasidan keshda bor
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`), enabled: site });
  const unread = q.data?.items.some((m) => m.sender.role !== 'CUSTOMER' && !m.readByCustomerAt) ?? false;
  const markRead = useApiMutation(() => api(`/orders/${id}/messages/read`, { method: 'POST' }), { invalidate: [['orders']] });
  useEffect(() => {
    if (unread && !markRead.isPending) markRead.mutate(undefined);
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useApiMutation(
    async (vars: { text?: string; image?: ImagePicker.ImagePickerAsset }) => {
      let attachmentUploadId: string | undefined;
      if (vars.image) {
        const form = await fileToForm({
          uri: vars.image.uri,
          name: vars.image.fileName ?? 'rasm.jpg',
          mimeType: vars.image.mimeType ?? 'image/jpeg',
          file: vars.image.file,
        });
        attachmentUploadId = (await api<{ id: string }>('/uploads/chat', { form })).id;
      }
      return api(`/orders/${id}/messages`, { body: { text: vars.text, attachmentUploadId } });
    },
    { invalidate: [['chat', id]], onSuccess: () => setText('') },
  );

  const attach = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) send.mutate({ image: r.assets[0] });
  };
  const submit = () => {
    if (text.trim()) send.mutate({ text: text.trim() });
  };

  return (
    <Screen
      scroll={false}
      siteWidth="page"
      title={t('chat')}
      crumbs={[
        { label: t('tabOrders'), href: '/orders' },
        { label: order.data?.number ?? '…', href: { pathname: '/order/[id]', params: { id } } },
      ]}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
          <IconButton icon="image-outline" label={t('attachImage')} onPress={() => void attach()} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('messagePlaceholder')}
            placeholderTextColor={colors.placeholder}
            multiline
            accessibilityLabel={t('messagePlaceholder')}
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 44,
              borderWidth: 1,
              borderColor: colors.input,
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              paddingHorizontal: space(4),
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: font.base + 1,
              color: colors.foreground,
              outlineWidth: 0,
            }}
          />
          <IconButton icon="send" label={t('send')} variant="primary" disabled={!text.trim() || send.isPending} onPress={submit} />
        </View>
      }
    >
      {(insets) => (
        <FlatList
          ref={list}
          data={q.data?.items ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            ...insets.container,
            flexGrow: 1,
            paddingTop: insets.top + space(4),
            paddingBottom: insets.bottom + space(4),
            gap: space(2),
          }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={insets.header}
          ListEmptyComponent={q.isPending ? <SkeletonList count={3} lines={1} /> : <EmptyState icon="chatbubbles-outline" title={t('chat')} hint={t('noMessages')} />}
          renderItem={({ item }) => <MessageBubble m={item} />}
        />
      )}
    </Screen>
  );
}
