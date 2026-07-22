import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button } from '../components/Button';
import { CARD_CORNER_WIDTH, CARD_SIZES, PlayingCard } from '../components/PlayingCard';
import { ScoreBoard } from '../components/ScoreBoard';
import { formatChips, formatSignedChips } from '../chips';
import { TurnTimer, useTurnCountdown } from '../components/TurnTimer';
import type { Card } from '../shared/cards';
import { THREE_OF_DIAMONDS, cardName } from '../shared/cards';
import { beats, comboLabel, detectCombo } from '../shared/combos';
import type { GameView, PlayerView } from '../shared/protocol';
import { theme } from '../theme';

/**
 * Өргөн дэлгэц дээр агуулгыг хэт татахгүйн тулд тавьсан хязгаар.
 * 13 хөзрийн бүтэн гар давхарлалгүй багтахаар сонгосон (13 × 56 + зай).
 */
const CONTENT_MAX_WIDTH = 780;

/**
 * Энэ өндрөөс нам бол хөндлөн барьсан утас гэж үзээд зайг нягтруулна.
 * Ингэснээр гар, товчнууд дэлгэцээс гарахгүй.
 */
const COMPACT_HEIGHT = 520;

/** Хэдэн хөзөр үлдэхэд анхааруулах вэ. */
const LAST_CARD_WARNING = 1;

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
  return Math.min(cardWidth - CARD_CORNER_WIDTH, (needed - available) / (cardCount - 1));
}

interface Props {
  view: GameView;
  onPlay: (cards: Card[]) => void;
  onPass: () => void;
  onNextRound: () => void;
  onNewMatch: () => void;
  onLeave: () => void;
  /** Тоглогчийн нэр дээр дарахад ил мэдээллийг нь харуулна. */
  onInspect: (playerId: string, name: string) => void;
}

export function TableScreen({
  view,
  onPlay,
  onPass,
  onNextRound,
  onNewMatch,
  onLeave,
  onInspect,
}: Props) {
  const [selected, setSelected] = useState<Card[]>([]);
  const { width, height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const you = view.players.find((p) => p.id === view.youId);
  const yourTurn = view.turnId === view.youId;
  const overlap = handOverlap(view.yourHand.length, width);
  const secondsLeft = useTurnCountdown(view.turnRemainingMs, view.turnSeq);

  // Гар өөрчлөгдөх бүрд сонголтыг цэвэрлэнэ.
  useEffect(() => setSelected([]), [view.yourHand.length, view.round]);

  const toggle = (card: Card) =>
    setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));

  const problem = useMemo(() => validate(selected, view), [selected, view]);

  if (view.phase === 'roundEnd' || view.phase === 'matchEnd') {
    return (
      <Results
        view={view}
        isHost={you?.isHost ?? false}
        onNextRound={onNextRound}
        onNewMatch={onNewMatch}
        onLeave={onLeave}
      />
    );
  }

  const seated = view.seats
    .map((id) => view.players.find((p) => p.id === id))
    .filter((p): p is PlayerView => !!p);
  const opponents = rotate(seated, view.youId).filter((p) => p.id !== view.youId);
  const benched = view.players.filter((p) => !p.seated && !p.eliminated);
  // Хасагдсан тоглогчид тоглолтоос гарахгүй — үзэгч болж үлдэж, чатлана.
  const knockedOut = view.players.filter((p) => p.eliminated);
  const youAreOut = you?.eliminated ?? false;
  // Хэн нэгэн сүүлийн хөзөртэй үлдвэл бүх тоглогчид анхааруулна.
  const lastCardPlayers = seated.filter(
    (p) => p.handCount === LAST_CARD_WARNING && p.place === null,
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.topBar}>
        <Text style={styles.topText}>{view.round}-р тойрог</Text>
        <View style={styles.topRight}>
          <Text style={styles.topText}>Босго {view.targetScore}</Text>
          <TurnTimer secondsLeft={secondsLeft} yours={yourTurn} />
        </View>
      </View>

      <View style={styles.opponents}>
        {opponents.map((p) => (
          <Opponent
            key={p.id}
            player={p}
            isTurn={view.turnId === p.id}
            secondsLeft={view.turnId === p.id ? secondsLeft : null}
            onInspect={() => onInspect(p.id, p.name)}
          />
        ))}
      </View>

      {benched.length > 0 && (
        <View style={styles.bench}>
          <Text style={styles.benchLabel}>Өнжиж байна:</Text>
          {benched.map((p) => (
            <Pressable key={p.id} onPress={() => onInspect(p.id, p.name)} accessibilityRole="button">
              <Text style={styles.benchName}>
                {p.name}
                {p.id === view.youId ? ' (та)' : ''} · {p.score} оноо
                {p.draw !== null ? ` · ${cardName(p.draw)}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {knockedOut.length > 0 && (
        <View style={styles.bench}>
          <Text style={styles.benchLabel}>Хасагдсан (үзэж байна):</Text>
          {knockedOut.map((p) => (
            <Pressable key={p.id} onPress={() => onInspect(p.id, p.name)} accessibilityRole="button">
              <Text style={[styles.benchName, styles.benchOut]}>
                {p.name}
                {p.id === view.youId ? ' (та)' : ''} · {p.score} оноо
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {lastCardPlayers.length > 0 && (
        <View style={styles.alert}>
          <Text style={styles.alertText} numberOfLines={2}>
            ⚠ {lastCardPlayers.map((p) => (p.id === view.youId ? 'Та' : p.name)).join(', ')}{' '}
            сүүлийн нэг хөзөртэй үлдлээ — дараагийн тавилтаараа дуусгаж магадгүй!
          </Text>
        </View>
      )}

      <View style={[styles.table, compact && styles.tableCompact]}>
        {view.current ? (
          <>
            <Text style={styles.tableLabel}>
              {nameOf(view, view.current.playerId)} — {view.current.label}
            </Text>
            <View style={styles.tableCards}>
              {view.current.cards.map((c) => (
                <PlayingCard key={c} card={c} size={compact ? 'sm' : 'md'} />
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

      {!compact && (
        <Text style={styles.log} numberOfLines={1}>
          {view.log[view.log.length - 1] ?? ''}
        </Text>
      )}

      {view.youAreSeated ? (
        <View style={[styles.handArea, compact && styles.handAreaCompact]}>
          <View style={styles.statusRow}>
            <Text style={[styles.turnText, yourTurn && styles.turnActive]}>
              {yourTurn ? 'Таны ээлж' : `${nameOf(view, view.turnId)}-ийн ээлж`}
            </Text>
            <Text style={styles.score}>Оноо: {you?.score ?? 0}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.fan, compact && styles.fanCompact]}
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
      ) : (
        <View style={styles.spectator}>
          <Text style={styles.spectatorTitle}>
            {youAreOut ? 'Та хасагдлаа — үзэж байна' : 'Та энэ тойрогт өнжиж байна'}
          </Text>
          <Text style={styles.hint}>
            {youAreOut
              ? 'Тоглолт дуустал үзэж, чатлаж болно. Тоглогчдын гар харагдахгүй. Дараагийн тоглолтод дахин орно.'
              : 'Ширээн дээрх хөзрийг харж болно, гэхдээ тоглогчдын гар харагдахгүй. Оноо нэмэгдэхгүй — дараагийн тойрогт орно.'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Сонгосон хөзрүүд тавигдах боломжтой эсэх; болохгүй бол шалтгааныг буцаана. */
function validate(selected: Card[], view: GameView): string | null {
  if (selected.length === 0) return 'Хөзөр сонгоно уу';
  const combo = detectCombo(selected);
  if (!combo) return 'Энэ нь хүчинтэй хослол биш';
  if (view.current) {
    const current = detectCombo(view.current.cards);
    if (current && !beats(combo, current)) {
      return combo.size === current.size
        ? 'Ширээн дээрхийг дарахгүй байна'
        : 'Хөзрийн тоо таарахгүй';
    }
  }
  return null;
}

function previewLabel(selected: Card[]): string {
  const combo = detectCombo(selected);
  return combo ? `✓ ${comboLabel(combo)}` : '';
}

function Opponent({
  player,
  isTurn,
  secondsLeft,
  onInspect,
}: {
  player: PlayerView;
  isTurn: boolean;
  secondsLeft: number | null;
  onInspect: () => void;
}) {
  const lastCard = player.handCount === LAST_CARD_WARNING && player.place === null;

  return (
    <View
      style={[
        styles.opponent,
        isTurn && styles.opponentActive,
        lastCard && styles.opponentDanger,
      ]}
    >
      <View style={styles.opponentHeader}>
        <View
          style={[styles.dot, { backgroundColor: player.connected ? theme.success : theme.danger }]}
        />
        {/* Нэр дээр дарахад токен, тоглолтын түүх нь харагдана. */}
        <Pressable onPress={onInspect} accessibilityRole="button" style={styles.nameHit}>
          <Text style={styles.opponentName} numberOfLines={1}>
            {player.name}
          </Text>
        </Pressable>
        {/* Тоолуур нь онооны оронд ОРОХГҮЙ — оноо доод мөрөнд байнга харагдана. */}
        {isTurn && <TurnTimer secondsLeft={secondsLeft} compact />}
      </View>

      {lastCard ? (
        <Text style={styles.lastCardBadge} numberOfLines={1}>
          ⚠ СҮҮЛИЙН ХӨЗӨР
        </Text>
      ) : (
        <View style={styles.miniStack}>
          {Array.from({ length: Math.min(player.handCount, 5) }).map((_, i) => (
            <View key={i} style={i === 0 ? undefined : styles.miniOverlap}>
              <View style={styles.miniCard} />
            </View>
          ))}
        </View>
      )}
      <View style={styles.opponentFooter}>
        <Text style={[styles.opponentMeta, lastCard && styles.dangerText]} numberOfLines={1}>
          {player.place !== null
            ? `${player.place}-р байр`
            : player.passed
              ? `пас · ${player.handCount} хөзөр`
              : `${player.handCount} хөзөр`}
        </Text>
        <Text style={styles.opponentScore}>{player.score} оноо</Text>
      </View>
    </View>
  );
}

function Results({
  view,
  isHost,
  onNextRound,
  onNewMatch,
  onLeave,
}: {
  view: GameView;
  isHost: boolean;
  onNextRound: () => void;
  onNewMatch: () => void;
  onLeave: () => void;
}) {
  const matchOver = view.phase === 'matchEnd';
  const winner = view.players.find((p) => p.id === view.matchWinnerId);
  const dragon = view.history.at(-1)?.dragonPlayerId;
  const justOut = view.players.filter((p) => p.eliminated);

  return (
    <ScrollView contentContainerStyle={styles.resultsContainer}>
      {dragon ? (
        <View style={styles.dragonBanner}>
          <Text style={styles.dragonTitle}>🐉 ЛУУ!</Text>
          <Text style={styles.dragonText}>
            {nameOf(view, dragon)}-д 13 дараалсан хөзөр буулаа — тоглолтыг шууд хожлоо.
          </Text>
        </View>
      ) : (
        <Text style={styles.resultTitle}>
          {matchOver ? 'Тоглолт дууслаа' : `${view.round}-р тойрог дууслаа`}
        </Text>
      )}

      {matchOver && winner && !dragon && (
        <Text style={styles.winner}>🏆 {winner.name} хожлоо!</Text>
      )}

      {matchOver && view.settlement && (
        <View style={styles.moneyPanel}>
          <Text style={styles.moneyTitle}>Чипийн тооцоо</Text>
          <Text style={styles.moneySubtitle}>
            Нэг хүний чип {formatChips(view.stake)}
          </Text>
          {[...view.settlement]
            .sort((a, b) => b.amount - a.amount)
            .map((entry) => {
              const player = view.players.find((p) => p.id === entry.playerId);
              const won = entry.amount > 0;
              return (
                <View key={entry.playerId} style={styles.moneyRow}>
                  <Text style={styles.moneyName} numberOfLines={1}>
                    {player?.name ?? '?'}
                    {entry.playerId === view.youId ? ' (та)' : ''}
                  </Text>
                  <Text style={styles.moneyVerb}>{won ? 'хожсон' : 'алдсан'}</Text>
                  <Text style={[styles.moneyAmount, won ? styles.moneyWon : styles.moneyLost]}>
                    {formatSignedChips(entry.amount)}
                  </Text>
                </View>
              );
            })}
          <Text style={styles.moneyNote}>
            Виртуал чип — бодит мөнгө биш.
          </Text>
        </View>
      )}

      <View style={styles.resultPanel}>
        <ScoreBoard
          players={view.players}
          history={view.history}
          targetScore={view.targetScore}
          youId={view.youId}
        />
      </View>

      {!matchOver && justOut.length > 0 && (
        <Text style={styles.hint}>
          Хасагдсан: {justOut.map((p) => `${p.name} (${p.score})`).join(', ')}
        </Text>
      )}

      <View style={styles.resultActions}>
        {isHost ? (
          matchOver ? (
            <Button title="Шинэ тоглолт" onPress={onNewMatch} />
          ) : (
            <Button title="Дараагийн тойрог" onPress={onNextRound} />
          )
        ) : (
          <Text style={styles.hint}>
            Өрөөний эзэн {matchOver ? 'шинэ тоглолт эхлүүлэхийг' : 'үргэлжлүүлэхийг'} хүлээж
            байна…
          </Text>
        )}
        <Button title="Гарах" variant="ghost" onPress={onLeave} />
      </View>
    </ScrollView>
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
    gap: 8,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  containerCompact: { padding: 6, gap: 4 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topText: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },

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
  opponentDanger: { borderColor: theme.danger, backgroundColor: 'rgba(226,87,76,0.12)' },
  opponentHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  opponentName: { color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 },
  opponentScore: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  opponentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  dangerText: { color: theme.danger, fontWeight: '800' },
  lastCardBadge: {
    color: theme.danger,
    fontSize: 11,
    fontWeight: '900',
    paddingVertical: 6,
  },
  alert: {
    backgroundColor: theme.danger,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertText: { color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
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

  bench: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  benchLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  benchName: { color: theme.textMuted, fontSize: 11 },
  benchOut: { color: theme.danger },
  nameHit: { flexShrink: 1 },

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
  tableCompact: { borderRadius: 12, padding: 6, gap: 4, borderWidth: 2 },
  tableLabel: { color: theme.text, fontSize: 14, fontWeight: '600' },
  tableCards: { flexDirection: 'row', gap: 6 },
  emptyTable: { alignItems: 'center', gap: 6 },
  hint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  log: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },

  handArea: { gap: 8 },
  handAreaCompact: { gap: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  turnText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  turnActive: { color: theme.accent },
  score: { color: theme.textMuted, fontSize: 13 },
  fan: {
    paddingTop: 20,
    paddingBottom: 4,
    paddingHorizontal: 4,
    flexGrow: 1,
    justifyContent: 'center',
  },
  fanCompact: { paddingTop: 18, paddingBottom: 0 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  problem: { color: theme.textMuted, fontSize: 12, textAlign: 'center', minHeight: 16 },

  spectator: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    gap: 6,
    alignItems: 'center',
  },
  spectatorTitle: { color: theme.accent, fontSize: 15, fontWeight: '700' },

  resultsContainer: {
    padding: 16,
    gap: 14,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  resultTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
  },
  winner: { color: theme.accent, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  dragonBanner: {
    backgroundColor: '#3b1d5e',
    borderRadius: theme.radius,
    padding: 16,
    gap: 6,
    marginTop: 20,
    borderWidth: 2,
    borderColor: theme.accent,
  },
  dragonTitle: { color: theme.accent, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  dragonText: { color: theme.text, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  resultPanel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 12 },
  moneyPanel: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  moneyTitle: { color: theme.accent, fontSize: 16, fontWeight: '800' },
  moneySubtitle: { color: theme.textMuted, fontSize: 12 },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moneyName: { color: theme.text, fontSize: 15, flex: 1, fontWeight: '600' },
  moneyVerb: { color: theme.textMuted, fontSize: 12 },
  moneyAmount: { fontSize: 16, fontWeight: '800', minWidth: 110, textAlign: 'right' },
  moneyWon: { color: theme.success },
  moneyLost: { color: theme.danger },
  moneyNote: { color: theme.textMuted, fontSize: 11, fontStyle: 'italic' },
  resultActions: { gap: 8 },
});
