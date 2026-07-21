import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, isRed, rankName, suitName } from '../shared/cards';
import { theme } from '../theme';

export const CARD_SIZES = {
  sm: { width: 40, height: 58, rank: 14, suit: 18 },
  md: { width: 54, height: 78, rank: 18, suit: 24 },
} as const;

export type CardSize = keyof typeof CARD_SIZES;

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
      <Text style={[styles.rank, { fontSize: s.rank, color }]}>{rankName(card)}</Text>
      <Text style={[styles.suit, { fontSize: s.suit, color }]}>{suitName(card)}</Text>
    </View>
  );

  if (!onPress) return face;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${rankName(card)} ${suitName(card)}`}>
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
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  selected: {
    borderColor: theme.accent,
    borderWidth: 2,
    transform: [{ translateY: -14 }],
  },
  dimmed: { opacity: 0.45 },
  rank: { fontWeight: '700', lineHeight: undefined },
  suit: { alignSelf: 'flex-end', lineHeight: undefined },
  back: {
    backgroundColor: theme.cardBack,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
});
