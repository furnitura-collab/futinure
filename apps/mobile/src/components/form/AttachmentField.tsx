import { Image } from 'expo-image';
import { Platform, View } from 'react-native';
import { Button, IconButton, Icon, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { pickImage, pickPdf, type Picked } from '@/lib/pick';
import { radius, space, useTheme } from '@/theme';
import { FieldLabel } from './FieldLabel';

interface AttachmentFieldProps {
  label: string;
  value: Picked | null;
  onChange: (f: Picked | null) => void;
  allowPdf?: boolean;
  quality?: number;
}

/** Chek / topshirish surati: kamera (telefonda), galereya, ixtiyoriy PDF va oldindan ko'rish */
export function AttachmentField({ label, value, onChange, allowPdf, quality }: AttachmentFieldProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const set = (f: Picked | null) => f && onChange(f);

  return (
    <View style={{ gap: space(2) }}>
      <FieldLabel>{label}</FieldLabel>
      {value ? (
        <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          {value.mimeType.startsWith('image/') ? (
            <Image source={{ uri: value.uri }} style={{ height: 220 }} contentFit="contain" />
          ) : (
            <Row style={{ padding: space(4) }}>
              <Icon name="document-text-outline" size={28} tone="primary" />
              <Text style={{ flex: 1 }} numberOfLines={1}>{value.name}</Text>
            </Row>
          )}
          <View style={{ position: 'absolute', top: space(2), right: space(2) }}>
            <IconButton icon="close" label={t('remove')} variant="secondary" size={36} onPress={() => onChange(null)} />
          </View>
        </View>
      ) : (
        <Row style={{ flexWrap: 'wrap' }}>
          {Platform.OS !== 'web' && (
            <Button title={t('takePhoto')} variant="outline" size="md" style={{ flex: 1 }} onPress={() => void pickImage(true, quality).then(set)} />
          )}
          <Button title={t('pickPhoto')} variant="outline" size="md" style={{ flex: 1 }} onPress={() => void pickImage(false, quality).then(set)} />
          {allowPdf && <Button title={t('pickPdf')} variant="outline" size="md" onPress={() => void pickPdf().then(set)} />}
        </Row>
      )}
    </View>
  );
}
