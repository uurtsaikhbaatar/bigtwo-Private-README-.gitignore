import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { joinUrl } from '../deeplink';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  SEATS_PER_ROUND,
  TARGET_SCORE_CHOICES,
} from '../shared/game';
import type { GameView } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  view: GameView;
  onStart: (targetScore: number) => void;
  onLeave: () => void;
}

export function LobbyScreen({ view, onStart, onLeave }: Props) {
  const [target, setTarget] = useState<number>(TARGET_SCORE_CHOICES[0]);
  const you = view.players.find((p) => p.id === view.youId);
  const isHost = you?.isHost ?? false;
  const enough = view.players.length >= MIN_PLAYERS;
  const rotating = view.players.length > SEATS_PER_ROUND;

  const link = joinUrl(view.code);
  const share = () => {
    void Share.share({
      message: link
        ? `Дай Ди тоглоом! Линк дарахад шууд орно:\n${link}`
        : `Дай Ди тоглоом! Өрөөний код: ${view.code}`,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Өрөөний код</Text>
      <Text style={styles.code} accessibilityLabel={view.code.split('').join(' ')}>
        {view.code}
      </Text>
      <Button title="Найзууддаа илгээх" variant="secondary" onPress={share} />
      {link && (
        <Text style={styles.link} numberOfLines={1}>
          {link}
        </Text>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>
          Тоглогчид ({view.players.length}/{MAX_PLAYERS})
        </Text>
        {view.players.map((p) => (
          <View key={p.id} style={styles.row}>
            <View
              style={[styles.dot, { backgroundColor: p.connected ? theme.success : theme.textMuted }]}
            />
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
              {p.id === view.youId ? ' (та)' : ''}
            </Text>
            {p.isHost && <Text style={styles.badge}>эзэн</Text>}
          </View>
        ))}
        {!enough && <Text style={styles.hint}>Дор хаяж нэг найзаа хүлээж байна…</Text>}
        {rotating && (
          <Text style={styles.hint}>
            Хөзөр 52 тул дугуй бүрд {SEATS_PER_ROUND} хүн тоглоно — үлдсэн нь ээлжлэн өнжинө.
          </Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Хэдэн оноонд хүрвэл хасагдах вэ?</Text>
        <View style={styles.choices}>
          {TARGET_SCORE_CHOICES.map((choice) => {
            const active = target === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => setTarget(choice)}
                disabled={!isHost}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.choice, active && styles.choiceActive, !isHost && styles.choiceLocked]}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{choice}</Text>
                <Text style={styles.choiceLabel}>оноо</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {isHost
            ? 'Босгод хүрсэн тоглогч хасагдаж, бусад нь үргэлжлүүлнэ. Сүүлд үлдсэн нь хожино.'
            : `Өрөөний эзэн ${target} оноо сонгосон байна.`}
        </Text>
      </View>

      <View style={styles.actions}>
        {isHost ? (
          <Button title="Тоглоом эхлүүлэх" onPress={() => onStart(target)} disabled={!enough} />
        ) : (
          <Text style={styles.hint}>Өрөөний эзэн эхлүүлэхийг хүлээж байна…</Text>
        )}
        <Button title="Өрөөнөөс гарах" variant="ghost" onPress={onLeave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  eyebrow: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  code: {
    color: theme.accent,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 6,
  },
  link: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
  panel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, gap: 10 },
  panelTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: theme.text, fontSize: 16, flex: 1 },
  badge: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  choices: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.surfaceRaised,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
  },
  choiceActive: { borderColor: theme.accent },
  choiceLocked: { opacity: 0.6 },
  choiceText: { color: theme.textMuted, fontSize: 24, fontWeight: '800' },
  choiceTextActive: { color: theme.accent },
  choiceLabel: { color: theme.textMuted, fontSize: 11 },
  actions: { gap: 8, marginTop: 4 },
});
