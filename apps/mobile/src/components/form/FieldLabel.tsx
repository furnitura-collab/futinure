import { Text } from '@/components/ui';

/** Forma bo'limi sarlavhasi (Input'dan tashqaridagi guruhlar uchun) */
export function FieldLabel({ children }: { children: string }) {
  return (
    <Text v="small" bold>
      {children}
    </Text>
  );
}
