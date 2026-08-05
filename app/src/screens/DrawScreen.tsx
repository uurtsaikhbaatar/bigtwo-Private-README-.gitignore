/**
 * Суудлын сугалтын дэлгэц (5+ хүн тоглоход).
 *
 * Ширээн дээр далд хөзрүүд дэлгэгдэнэ. Тоглогч нэгийг дарж сонгоно (зэрэг
 * сонговол сервер дээр түрүүлсэн нь авна). Бүгд сонгоод, эсвэл хугацаа дуусахад
 * ил болж, хамгийн БАГА хөзөр сонгосон 4 тоглоно (5 сек харагдана).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CardBack, PlayingCard } from '../components/PlayingCard';
import { rankOf } from '../shared/cards';
import type { GameView } from '../shared/protocol';
import { theme } from '../theme';

const SEATS_PER_ROUND = 4;

interface Props {
  view: GameView;
  onPick: (index: number) => void;
}

export function DrawScreen({ view, onPick }: Props) {
  const draw = view.draw;
  const nameOf = (id: string | null) =>
    id ? view.players.find((p) => p.id === id)?.name ?? '?' : '';

  // Үлдсэн хугацааг тоолно.
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!draw || draw.remainingMs === null) return setSecs(0);
    const end = Date.now() + draw.remainingMs;
    const tick = () => setSecs(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [draw?.remainingMs, draw?.revealed]);

  // Ил болсны дараа: хэн тоглох / өнжихийг тоолно (хамгийн бага 4 тоглоно).
  const outcome = useMemo(() => {
    if (!draw?.revealed) return null;
    const picks = draw.claimedBy
      .map((id, i) => ({ id, card: draw.cards[i] }))
      .filter((x): x is { id: string; card: number } => !!x.id && x.card !== null);
    const sorted = picks.slice().sort((a, b) => a.card - b.card);
    const playing = new Set(sorted.slice(0, SEATS_PER_ROUND).map((x) => x.id));
    return { playing };
  }, [draw]);

  if (!draw) return null;
  const iPicked = draw.yourPick !== null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🎴 Суудлын сугалт</Text>
      <Text style={styles.subtitle}>
        {draw.revealed
          ? 'Хамгийн бага хөзөр сонгосон 4 тоглоно'
          : iPicked
            ? 'Бусад тоглогчдыг хүлээж байна…'
            : 'Далд хөзрөөс нэгийг сонгоно уу'}
      </Text>
      {secs > 0 && <Text style={styles.timer}>{secs} сек</Text>}

      <View style={styles.grid}>
        {draw.claimedBy.map((claimer, i) => {
          const mine = claimer === view.youId;
          const card = draw.cards[i];
          const canPick = !draw.revealed && !iPicked && claimer === null;
          const plays = draw.revealed && outcome?.playing.has(claimer ?? '');
          return (
            <View key={i} style={styles.cell}>
              <Pressable
                onPress={() => canPick && onPick(i)}
                disabled={!canPick}
                accessibilityRole="button"
                style={[
                  styles.cardWrap,
                  mine && styles.cardMine,
                  draw.revealed && (plays ? styles.cardPlays : styles.cardBench),
                ]}
              >
                {draw.revealed && card !== null ? (
                  <PlayingCard card={card} size="sm" />
                ) : (
                  <CardBack size="sm" />
                )}
              </Pressable>
              <Text
                style={[styles.name, mine && styles.nameMine]}
                numberOfLines={1}
              >
                {claimer ? (mine ? 'Та' : nameOf(claimer)) : '—'}
              </Text>
              {draw.revealed && claimer && (
                <Text style={[styles.tag, plays ? styles.tagPlays : styles.tagBench]}>
                  {plays ? 'Тоглоно' : 'Өнжинө'}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {!draw.revealed && (
        <Text style={styles.hint}>
          Хөзөр холигдсон — сонголт санамсаргүй. Зэрэг сонговол түрүүлсэн нь авна.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%' },
  title: { color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 12 },
  subtitle: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  timer: { color: theme.accent, fontSize: 20, fontWeight: '800' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  cell: { alignItems: 'center', gap: 4, width: 76 },
  cardWrap: {
    borderRadius: 10,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardMine: { borderColor: theme.accent },
  cardPlays: { borderColor: theme.success },
  cardBench: { borderColor: theme.textMuted, opacity: 0.6 },
  name: { color: theme.text, fontSize: 12, fontWeight: '600', maxWidth: 74, textAlign: 'center' },
  nameMine: { color: theme.accent, fontWeight: '800' },
  tag: { fontSize: 10, fontWeight: '800' },
  tagPlays: { color: theme.success },
  tagBench: { color: theme.textMuted },
  hint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 17,
  },
});
