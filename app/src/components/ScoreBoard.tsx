import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RoundRecord } from '../shared/game';
import type { PlayerView } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  players: PlayerView[];
  history: RoundRecord[];
  targetScore: number;
  youId: string;
}

const NAME_WIDTH = 92;
const CELL_WIDTH = 56;

/**
 * Дугуй бүрд тоглогч тус бүр хэдэн оноо нэмсэнийг харуулах хүснэгт.
 * Тоглогч олон байж болох тул хэвтээ чиглэлд гүйнэ.
 */
export function ScoreBoard({ players, history, targetScore, youId }: Props) {
  if (history.length === 0) {
    return <Text style={styles.empty}>Дугуй хараахан дуусаагүй байна.</Text>;
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Толгой мөр: дугаарууд */}
          <View style={styles.row}>
            <Text style={[styles.nameCell, styles.headerText]}>Тоглогч</Text>
            {history.map((rec) => (
              <Text key={rec.round} style={[styles.cell, styles.headerText]}>
                {rec.round}
              </Text>
            ))}
            <Text style={[styles.cell, styles.headerText, styles.totalCell]}>Нийт</Text>
          </View>

          {players.map((p) => (
            <View key={p.id} style={[styles.row, p.id === youId && styles.rowYou]}>
              <Text
                style={[styles.nameCell, styles.nameText, p.eliminated && styles.struck]}
                numberOfLines={1}
              >
                {p.name}
                {p.id === youId ? ' (та)' : ''}
              </Text>

              {history.map((rec) => {
                const entry = rec.entries.find((e) => e.playerId === p.id);
                if (!entry || !entry.played) {
                  return (
                    <Text key={rec.round} style={[styles.cell, styles.benched]}>
                      –
                    </Text>
                  );
                }
                if (rec.dragonPlayerId) {
                  return (
                    <Text key={rec.round} style={[styles.cell, styles.dragon]}>
                      {rec.dragonPlayerId === p.id ? '🐉' : '·'}
                    </Text>
                  );
                }
                return (
                  <View key={rec.round} style={styles.cell}>
                    <Text style={[styles.delta, entry.delta === 0 && styles.zero]}>
                      {entry.delta === 0 ? '0' : `+${entry.delta}`}
                    </Text>
                    {entry.multiplier > 1 && (
                      <Text style={styles.multiplier}>×{entry.multiplier}</Text>
                    )}
                  </View>
                );
              })}

              <View style={[styles.cell, styles.totalCell]}>
                <Text style={[styles.total, p.eliminated && styles.eliminated]}>{p.score}</Text>
                {p.eliminated && <Text style={styles.outMark}>хасагдсан</Text>}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.legend}>
        Босго {targetScore} оноо · «–» өнжсөн · ×2 = 10+ хөзөр · ×3 = нэг ч хөзөр гаргаагүй
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  empty: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    minHeight: 34,
  },
  rowYou: { backgroundColor: 'rgba(242,183,5,0.08)' },
  nameCell: { width: NAME_WIDTH, paddingRight: 6 },
  nameText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  struck: { color: theme.textMuted, textDecorationLine: 'line-through' },
  headerText: { color: theme.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cell: { width: CELL_WIDTH, alignItems: 'center', justifyContent: 'center' },
  totalCell: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' },
  delta: { color: theme.text, fontSize: 14, fontWeight: '600' },
  zero: { color: theme.success },
  multiplier: { color: theme.danger, fontSize: 9, fontWeight: '700' },
  benched: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  dragon: { fontSize: 14, textAlign: 'center' },
  total: { color: theme.text, fontSize: 15, fontWeight: '800' },
  eliminated: { color: theme.danger },
  outMark: { color: theme.danger, fontSize: 8 },
  legend: { color: theme.textMuted, fontSize: 10, lineHeight: 14 },
});
