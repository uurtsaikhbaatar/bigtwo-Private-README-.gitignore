import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { theme } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        variants[variant],
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <Text style={[styles.label, variant === 'ghost' && styles.labelGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  label: { color: theme.text, fontSize: 16, fontWeight: '700' },
  labelGhost: { color: theme.textMuted, fontWeight: '600' },
});

const variants: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: '#1d7a52' },
  secondary: { backgroundColor: theme.surfaceRaised },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: theme.danger },
};
