/**
 * Цолны тэмдэг — тоглогчийн нэрний хажууд.
 *
 * Зочин (бүртгэлгүй) тоглогчид цол байхгүй тул юу ч харуулахгүй.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { rankFor } from '../shared/ranks';
import { theme } from '../theme';

interface Props {
  wins: number | null;
  /** Цолны нэрийг бүтнээр нь харуулах эсэх (зайтай газарт). */
  full?: boolean;
}

export function RankBadge({ wins, full = false }: Props) {
  if (wins === null) return null;
  const rank = rankFor(wins);

  return (
    <View style={styles.box}>
      <Text style={styles.badge}>{rank.badge}</Text>
      {full && <Text style={styles.name}>{rank.name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(242,183,5,0.12)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badge: { color: theme.accent, fontSize: 10, fontWeight: '800' },
  name: { color: theme.accent, fontSize: 11, fontWeight: '700' },
});
