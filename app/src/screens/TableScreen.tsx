import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { Card } from '../shared/cards';
import { THREE_OF_DIAMONDS } from '../shared/cards';
import { beats, comboLabel, detectCombo } from '../shared/combos';
import type { GameView, PlayerView } from '../shared/protocol';
import { Button } from '../components/Button';
import { CARD_CORNER_WIDTH, CARD_SIZES, PlayingCard } from '../components/PlayingCard';
import { theme } from '../theme';

/**
 * Өргөн дэлгэц дээр агуулгыг хэт татахгүйн тулд тавьсан хязгаар.
 * 13 хөзрийн бүтэн гар давхарлалгүй багтахаар сонгосон (13 × 56 + зай).
 */
const CONTENT_MAX_WIDTH = 780;

/**
 * Гарын хөзрүүд хэр их давхарлагдахыг тооцно.
 * Зай хүрэлцвэл огт давхарлахгүй; хүрэлцэхгүй бол булангийн тэмдэглэгээ
 * (зэрэглэл + баг) үргэлж харагдахуйц хэмжээгээр л давхарлана.
 */
function handOverlap(cardCount: number, screenWidth: number): number {
  if (cardCount < 2) return 0;
  const available = Math.min(screenWidth, CONTENT_MAX_WIDTH) - 32;
  const cardWidth = CARD_SIZES.md.width;
  const needed = cardCount * cardWidth;
  if (needed <= available) return 0;
  const maxOverlap = cardWidth - CARD_CORNER_WIDTH;
  return Math.min(maxOverlap, (needed - available) / (cardCount - 1));
}

interface Props {
  view: GameView;
  onPlay: (cards: Card[]) => void;
  onPass: () => void;
  onRematch: () => void;
  onLeave: () => void;
}

export function TableScreen({ view, onPlay, onPass, onRematch, onLeave }: Props) {
  const [selected, setSelected] = useState<Card[]>([]);
  const { width } = useWindowDimensions();
  const you = view.players.find((p) => p.id === view.youId);
  const yourTurn = view.turnId === view.youId;
  const overlap = handOverlap(view.yourHand.length, width);

  // Гар өөрчлөгдөх бүрд сонголтыг цэвэрлэнэ (тавилт амжилттай болсон гэсэн үг).
  useEffect(() => setSelected([]), [view.yourHand.length, view.round]);

  const toggle = (card: Card) =>
    setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));

  const problem = useMemo(() => validate(selected, view), [selected, view]);
  const opponents = rotate(view.players, view.youId).filter((p) => p.id !== view.youId);

  if (view.phase === 'finished') {
    return <Results view={view} isHost={you?.isHost ?? false} onRematch={onRematch} onLeave={onLeave} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.opponents}>
        {opponents.map((p) => (
          <Opponent key={p.id} player={p} isTurn={view.turnId === p.id} />
        ))}
      </View>

      <View style={styles.table}>
        {view.current ? (
          <>
            <Text style={styles.tableLabel}>
              {nameOf(view, view.current.playerId)} — {view.current.label}
            </Text>
            <View style={styles.tableCards}>
              {view.current.cards.map((c) => (
                <PlayingCard key={c} card={c} size="md" />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyTable}>
            <Text style={styles.tableLabel}>Шинэ эргэлт</Text>
            <Text style={styles.hint}>
              {yourTurn ? 'Дуртай хослолоо тавина уу' : `${nameOf(view, view.turnId)} эхэлнэ`}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.log} numberOfLines={1}>
        {view.log[view.log.length - 1] ?? ''}
      </Text>

      <View style={styles.handArea}>
        <View style={styles.statusRow}>
          <Text style={[styles.turnText, yourTurn && styles.turnActive]}>
            {yourTurn ? 'Таны ээлж' : `${nameOf(view, view.turnId)}-ийн ээлж`}
          </Text>
          <Text style={styles.score}>Оноо: {you?.total ?? 0}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fan}
        >
          {view.yourHand.map((card, i) => (
            <View key={card} style={i === 0 ? undefined : { marginLeft: -overlap }}>
              <PlayingCard
                card={card}
                selected={selected.includes(card)}
                onPress={() => toggle(card)}
              />
            </View>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            title="Пас"
            variant="secondary"
            onPress={onPass}
            disabled={!yourTurn || !view.current}
            style={styles.action}
          />
          <Button
            title={selected.length > 0 ? `Тавих (${selected.length})` : 'Тавих'}
            onPress={() => onPlay(selected)}
            disabled={!yourTurn || problem !== null}
            style={styles.action}
          />
        </View>
        <Text style={styles.problem}>
          {yourTurn && selected.length > 0 ? (problem ?? previewLabel(selected)) : ' '}
        </Text>
      </View>
    </View>
  );
}

/** Сонгосон хөзрүүд тавигдах боломжтой эсэх; болохгүй бол шалтгааныг буцаана. */
function validate(selected: Card[], view: GameView): string | null {
  if (selected.length === 0) return 'Хөзөр сонгоно уу';
  const combo = detectCombo(selected);
  if (!combo) return 'Энэ нь хүчинтэй хослол биш';
  if (
    view.lastPlay === null &&
    view.yourHand.includes(THREE_OF_DIAMONDS) &&
    !selected.includes(THREE_OF_DIAMONDS)
  ) {
    return 'Эхний тавилтад 3♦ орсон байх ёстой';
  }
  if (view.current) {
    const current = detectCombo(view.current.cards);
    if (current && !beats(combo, current)) {
      return combo.size === current.size ? 'Ширээн дээрхийг дарахгүй байна' : 'Хөзрийн тоо таарахгүй';
    }
  }
  return null;
}

function previewLabel(selected: Card[]): string {
  const combo = detectCombo(selected);
  return combo ? `✓ ${comboLabel(combo)}` : '';
}

function Opponent({ player, isTurn }: { player: PlayerView; isTurn: boolean }) {
  return (
    <View style={[styles.opponent, isTurn && styles.opponentActive]}>
      <View style={styles.opponentHeader}>
        <View
          style={[styles.dot, { backgroundColor: player.connected ? theme.success : theme.danger }]}
        />
        <Text style={styles.opponentName} numberOfLines={1}>
          {player.name}
        </Text>
      </View>
      <View style={styles.miniStack}>
        {Array.from({ length: Math.min(player.handCount, 5) }).map((_, i) => (
          <View key={i} style={i === 0 ? undefined : styles.miniOverlap}>
            <View style={styles.miniCard} />
          </View>
        ))}
      </View>
      <Text style={styles.opponentMeta}>
        {player.place !== null
          ? `${player.place}-р байр`
          : player.passed
            ? `пас · ${player.handCount}`
            : `${player.handCount} хөзөр`}
      </Text>
    </View>
  );
}

function Results({
  view,
  isHost,
  onRematch,
  onLeave,
}: {
  view: GameView;
  isHost: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const ordered = [...view.players].sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
  return (
    <View style={styles.container}>
      <Text style={styles.resultTitle}>{view.round}-р дугуй дууслаа</Text>
      <View style={styles.resultPanel}>
        {ordered.map((p) => {
          const r = view.results?.find((x) => x.playerId === p.id);
          return (
            <View key={p.id} style={styles.resultRow}>
              <Text style={styles.resultPlace}>{p.place}</Text>
              <Text style={styles.resultName} numberOfLines={1}>
                {p.name}
                {p.id === view.youId ? ' (та)' : ''}
              </Text>
              <Text style={styles.resultCards}>{r ? `${r.cardsLeft} хөзөр` : ''}</Text>
              <Text style={[styles.resultNet, (r?.net ?? 0) >= 0 ? styles.gain : styles.loss]}>
                {r ? (r.net > 0 ? `+${r.net}` : r.net) : ''}
              </Text>
              <Text style={styles.resultTotal}>{p.total}</Text>
            </View>
          );
        })}
        <Text style={styles.resultLegend}>байр · нэр · үлдсэн · энэ дугуй · нийт</Text>
      </View>

      <View style={styles.actions}>
        {isHost ? (
          <Button title="Дахин тоглох" onPress={onRematch} style={styles.action} />
        ) : (
          <Text style={styles.hint}>Өрөөний эзэн дахин эхлүүлэхийг хүлээж байна…</Text>
        )}
      </View>
      <Button title="Гарах" variant="ghost" onPress={onLeave} />
    </View>
  );
}

const nameOf = (view: GameView, id: string | null): string =>
  view.players.find((p) => p.id === id)?.name ?? '…';

/** Тоглогчдыг өөрөөс эхлэн эргүүлж, суудлын дараалал зөв харагдана. */
function rotate(players: PlayerView[], youId: string): PlayerView[] {
  const idx = players.findIndex((p) => p.id === youId);
  if (idx <= 0) return players;
  return [...players.slice(idx), ...players.slice(0, idx)];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    gap: 10,
    // Өргөн дэлгэц дээр агуулга дунд байрлаж, хэт татагдахгүй.
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  opponents: { flexDirection: 'row', gap: 8 },
  opponent: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 8,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  opponentActive: { borderColor: theme.accent },
  opponentHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  opponentName: { color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 },
  opponentMeta: { color: theme.textMuted, fontSize: 11 },
  miniStack: { flexDirection: 'row' },
  miniOverlap: { marginLeft: -14 },
  miniCard: {
    width: 20,
    height: 28,
    borderRadius: 4,
    backgroundColor: theme.cardBack,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },

  table: {
    flex: 1,
    backgroundColor: theme.felt,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 4,
    borderColor: theme.feltDark,
  },
  tableLabel: { color: theme.text, fontSize: 14, fontWeight: '600' },
  tableCards: { flexDirection: 'row', gap: 6 },
  emptyTable: { alignItems: 'center', gap: 6 },
  hint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  log: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },

  handArea: { gap: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  turnText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  turnActive: { color: theme.accent },
  score: { color: theme.textMuted, fontSize: 13 },
  // Хөзөр цөөрөхөд гар зүүн тийш наалдалгүй дунд байрлана.
  fan: { paddingTop: 20, paddingBottom: 4, paddingHorizontal: 4, flexGrow: 1, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  problem: { color: theme.textMuted, fontSize: 12, textAlign: 'center', minHeight: 16 },

  resultTitle: { color: theme.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 32 },
  resultPanel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 14, gap: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultPlace: { color: theme.accent, fontSize: 16, fontWeight: '800', width: 20 },
  resultName: { color: theme.text, fontSize: 15, flex: 1 },
  resultCards: { color: theme.textMuted, fontSize: 12, width: 62, textAlign: 'right' },
  resultNet: { fontSize: 15, fontWeight: '700', width: 44, textAlign: 'right' },
  resultTotal: { color: theme.text, fontSize: 15, width: 44, textAlign: 'right' },
  resultLegend: { color: theme.textMuted, fontSize: 10, textAlign: 'right' },
  gain: { color: theme.success },
  loss: { color: theme.danger },
});
