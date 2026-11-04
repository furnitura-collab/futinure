import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { Card } from './Card';
import { Text } from './Text';

/** ListItem'lar guruhi: sarlavha + bitta karta, qatorlar orasida ingichka chiziq */
export function ListGroup({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: space(2) }}>
      {title ? (
        <Text v="caption" bold style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: space(1) }}>
          {title}
        </Text>
      ) : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space(4) }} />}
            {child}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
