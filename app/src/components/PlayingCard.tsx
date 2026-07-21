import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, isRed, rankName, suitName } from '../shared/cards';
import { theme } from '../theme';

export const CARD_SIZES = {
  sm: { width: 40, height: 58, rank: 13, cornerSuit: 10, bigSuit: 16 },
  md: { width: 56, height: 80, rank: 19, cornerSuit: 14, bigSuit: 26 },
} as const;

export type CardSize = keyof typeof CARD_SIZES;

/**
 * Давхарлагдсан үед ч заавал харагдах ёстой булангийн өргөн.
 * Гарын хөзрүүдийг хэр их давхарлахыг энэ утга тодорхойлно.
 */
export const CARD_CORNER_WIDTH = 24;

interface Props {
  card: Card;
  size?: CardSize;
  selected?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
}

export function PlayingCard({ card, size = 'md', selected, dimmed, onPress }: Props) {
  const s = CARD_SIZES[size];
  const color = isRed(card) ? theme.red : theme.black;

  const face = (
    <View
      style={[
        styles.card,
        { width: s.width, height: s.height },
        selected && styles.selected,
        dimmed && styles.dimmed,
      ]}
    >
      {/* Зэрэглэл ба баг хоёулаа зүүн дээд буланд — жинхэнэ хөзөр шиг.
          Ингэснээр хөзрүүд давхарлагдсан ч аль хөзөр болох нь тодорхой. */}
      <View style={styles.corner}>
        <Text style={[styles.rank, { fontSize: s.rank, color }]}>{rankName(card)}</Text>
        <Text style={[styles.cornerSuit, { fontSize: s.cornerSuit, color }]}>{suitName(card)}</Text>
      </View>
      <Text style={[styles.bigSuit, { fontSize: s.bigSuit, color }]}>{suitName(card)}</Text>
    </View>
  );

  if (!onPress) return face;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rankName(card)} ${suitName(card)}`}
    >
      {face}
    </Pressable>
  );
}

/** Нүүрээ доош харуулсан хөзөр — бусад тоглогчийн гарыг илэрхийлнэ. */
export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  const s = CARD_SIZES[size];
  return <View style={[styles.back, { width: s.width, height: s.height }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 1, height: 2 },
    elevation: 3,
  },
  selected: {
    borderColor: theme.accent,
    borderWidth: 2,
    transform: [{ translateY: -16 }],
  },
  dimmed: { opacity: 0.45 },
  corner: {
    position: 'absolute',
    top: 3,
    left: 5,
    alignItems: 'center',
    width: CARD_CORNER_WIDTH - 10,
  },
  rank: { fontWeight: '800', includeFontPadding: false },
  cornerSuit: { marginTop: -2, includeFontPadding: false },
  bigSuit: { position: 'absolute', bottom: 3, right: 5, includeFontPadding: false },
  back: {
    backgroundColor: theme.cardBack,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
});
