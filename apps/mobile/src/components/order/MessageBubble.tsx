import { Image } from 'expo-image';
import { View } from 'react-native';
import { formatDateTime } from '@mebel/shared';
import { Icon, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { authedSource } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

export function MessageBubble({ m }: { m: ChatMessage }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const mine = m.sender.role === 'CUSTOMER';
  const fg = mine ? colors.primaryForeground : colors.foreground;

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? colors.primary : colors.card,
          borderRadius: radius.lg,
          borderBottomRightRadius: mine ? radius.sm / 2 : radius.lg,
          borderBottomLeftRadius: mine ? radius.lg : radius.sm / 2,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.border,
          paddingVertical: space(2),
          paddingHorizontal: space(3),
          gap: 4,
        }}
      >
        {!mine && <Text v="caption" bold tone="primary">{m.sender.fullName ?? t('manager')}</Text>}
        {m.attachment?.mimeType.startsWith('image/') && (
          <Image source={authedSource(`/chat/messages/${m.id}/attachment`)} style={{ width: 220, height: 170, borderRadius: radius.md }} contentFit="cover" />
        )}
        {m.attachment?.mimeType === 'application/pdf' && (
          <Row gap={6}>
            <Icon name="document-text-outline" size={18} color={fg} />
            <Text color={fg}>{t('pdfFile')}</Text>
          </Row>
        )}
        {m.text ? <Text color={fg}>{m.text}</Text> : null}
        <Row gap={4} style={{ alignSelf: 'flex-end' }}>
          <Text v="caption" color={mine ? fg : colors.mutedForeground} style={{ opacity: mine ? 0.8 : 1 }}>
            {formatDateTime(m.createdAt).slice(-5)}
          </Text>
          {mine && m.readByStaffAt ? <Icon name="checkmark-done" size={14} color={fg} /> : null}
        </Row>
      </View>
    </View>
  );
}
