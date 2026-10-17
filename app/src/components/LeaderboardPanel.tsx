/**
 * Топ тоглогчид — бүх хүнд харагдана (нэвтрэх шаардлагагүй).
 *
 * Цолыг тодорхойлдог чиптэй тоглолтын хожлоор эрэмбэлсэн топ 10-ыг харуулна.
 * Товч дарахад серверээс шинэ өгөгдөл татна.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GameKind, LeaderboardEntry } from '../shared/protocol';
import { rankFor } from '../shared/ranks';
import { Overlay } from './Overlay';
import { theme } from '../theme';

interface Props {
  entries: LeaderboardEntry[] | null;
  /** `entries` аль тоглоомынх вэ (хариу ирэх хүртэл хуучин жагсаалт харагдахгүй). */
  entriesGame?: GameKind;
  onLoad: (game: GameKind) => void;
  /** Одоо нэвтэрсэн хэрэглэгчийн нэр — өөрийгөө онцолж харуулна. */
  myUsername?: string | null;
}

/** Эхний 3-д медаль, бусдад дугаар. */
function medal(place: number): string {
  return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}`;
}

export function LeaderboardPanel({ entries, entriesGame = 'bigtwo', onLoad, myUsername }: Props) {
  const [open, setOpen] = useState(false);
  // Цол тоглоом тус бүрт тусдаа — таб сольж харна.
  const [game, setGame] = useState<GameKind>('bigtwo');
  const shown = entriesGame === game ? entries : null;

  const openPanel = () => {
    setOpen(true);
    onLoad(game); // нээх бүрд шинэчилнэ
  };
  const pick = (g: GameKind) => {
    setGame(g);
    onLoad(g);
  };

  return (
    <>
      <Pressable onPress={openPanel} accessibilityRole="button" style={styles.trigger}>
        <Text style={styles.triggerText}>🏆 Топ тоглогч нар</Text>
      </Pressable>

      <Overlay visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>🏆 Топ тоглогч нар</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.close}>Хаах</Text>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {(['bigtwo', 'holdem'] as const).map((g) => (
              <Pressable
                key={g}
                onPress={() => pick(g)}
                accessibilityRole="button"
                style={[styles.tab, game === g && styles.tabOn]}
              >
                <Text style={[styles.tabText, game === g && styles.tabTextOn]}>
                  {g === 'bigtwo' ? 'Big Two' : "Texas Hold'em"}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {shown === null ? (
              <Text style={styles.empty}>Ачаалж байна…</Text>
            ) : shown.length === 0 ? (
              <Text style={styles.empty}>Хараахан хожсон тоглогч алга.</Text>
            ) : (
              shown.map((e, i) => {
                const rank = rankFor(e.rankedWins);
                const mine = myUsername != null && e.username === myUsername;
                return (
                  <View key={e.username} style={[styles.row, mine && styles.rowMine]}>
                    <Text style={[styles.place, i < 3 && styles.placeTop]}>{medal(i + 1)}</Text>
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>
                        {e.username}
                        {mine && <Text style={styles.you}>  (та)</Text>}
                      </Text>
                      <View style={styles.rankLine}>
                        <Text style={styles.badge}>{rank.badge}</Text>
                        <Text style={styles.rankName} numberOfLines={1}>
                          {rank.name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.stats}>
                      <View style={styles.statRow}>
                        <Text style={styles.wins}>{e.rankedWins}</Text>
                        <Text style={styles.winsLabel}>хүнтэй</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.winsFree}>{e.wins - e.rankedWins}</Text>
                        <Text style={styles.winsLabel}>бусад</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            <Text style={styles.note}>
              {game === 'holdem'
                ? "Texas Hold'em-ийн цол нь Sit & Go тэмцээнд 1-р байр эзэлсэн (Buy-in-тэй, ядаж нэг хүн өрсөлдөгчтэй) хожлоор тоологдоно. Cash game цолд тооцогдохгүй. "
                : ''}
              Цол ба жагсаалт нь ЗӨВХӨН ХҮНТЭЙ тоглосон чиптэй хожлоор
              тодорхойлогдоно — роботоор фарм хийж цол авахгүй. "Бусад" гэдэгт
              роботтой болон чипгүй хожил орно (чипээ роботтой тоглоод хожиж болно,
              гэхдээ цолд тооцогдохгүй).
            </Text>
          </ScrollView>
        </View>
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: theme.accent },
  tabText: { color: theme.textMuted, fontWeight: '700', fontSize: 13 },
  tabTextOn: { color: '#1b1b1f' },
  trigger: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  triggerText: { color: theme.accent, fontSize: 15, fontWeight: '700' },

  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 15 },

  body: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  empty: { color: theme.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowMine: {
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: 'rgba(242,183,5,0.08)',
  },
  place: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 30,
    textAlign: 'center',
  },
  placeTop: { fontSize: 20 },
  info: { flex: 1, gap: 3 },
  name: { color: theme.text, fontSize: 16, fontWeight: '800' },
  you: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  rankLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badge: { color: theme.accent, fontSize: 11, fontWeight: '800' },
  rankName: { color: theme.accent, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  stats: { alignItems: 'flex-end', minWidth: 78, gap: 2 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  winsFree: { color: theme.textMuted, fontSize: 15, fontWeight: '700' },
  wins: { color: theme.text, fontSize: 20, fontWeight: '800' },
  winsLabel: { color: theme.textMuted, fontSize: 10 },
  note: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
});
