import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Loader, Text } from '../../../components/ui';
import { api, authedSource, fileToForm } from '../../../lib/api';
import { dateTime } from '../../../lib/format';
import { useI18n } from '../../../lib/i18n';
import { useApiMutation } from '../../../lib/mutation';
import { useOrderRoom } from '../../../lib/realtime';
import { colors, radius, space } from '../../../lib/theme';
import type { ChatMessage } from '../../../lib/types';
import { contained, CONTENT } from '../../../lib/layout';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  useOrderRoom(id);
  const list = useRef<FlatList<ChatMessage>>(null);
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['chat', id],
    queryFn: () => api<{ items: ChatMessage[] }>(`/orders/${id}/messages`, { query: { limit: 100 } }),
  });

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

  if (q.isPending) return <Loader />;
  const items = q.data?.items ?? [];

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(2), flexGrow: 1 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text muted>{t('noMessages')}</Text>
            </View>
          }
          renderItem={({ item: m }) => {
            const mine = m.sender.role === 'CUSTOMER';
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View
                  style={{
                    maxWidth: '82%',
                    backgroundColor: mine ? colors.brand : colors.card,
                    borderRadius: radius.lg,
                    borderWidth: mine ? 0 : 1,
                    borderColor: colors.border,
                    padding: space(3),
                    gap: 4,
                  }}
                >
                  {!mine && <Text v="caption" bold>{m.sender.fullName ?? 'Menejer'}</Text>}
                  {m.attachment?.mimeType.startsWith('image/') && (
                    <Image source={authedSource(`/chat/messages/${m.id}/attachment`)} style={{ width: 200, height: 160, borderRadius: radius.sm }} contentFit="cover" />
                  )}
                  {m.attachment?.mimeType === 'application/pdf' && <Text color={mine ? '#fff' : colors.text}>📄 PDF</Text>}
                  {m.text ? <Text color={mine ? '#fff' : colors.text}>{m.text}</Text> : null}
                  <Text v="caption" color={mine ? colors.brandSoft : colors.faint} style={{ alignSelf: 'flex-end' }}>
                    {dateTime(m.createdAt).slice(-5)}
                    {mine && m.readByStaffAt ? ' ✓✓' : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={{ padding: space(3), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          <View style={{ ...contained(CONTENT.page), flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Pressable onPress={() => void attach()} style={{ padding: space(2) }} accessibilityLabel="attach">
              <Ionicons name="image-outline" size={24} color={colors.muted} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('messagePlaceholder')}
              placeholderTextColor={colors.faint}
              multiline
              style={{ flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space(3), paddingTop: 10, fontSize: 16, color: colors.text }}
            />
            <Pressable
              onPress={() => text.trim() && send.mutate({ text: text.trim() })}
              disabled={!text.trim() || send.isPending}
              style={{ backgroundColor: text.trim() ? colors.brand : colors.border, borderRadius: radius.full, padding: 10 }}
              accessibilityLabel={t('send')}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
