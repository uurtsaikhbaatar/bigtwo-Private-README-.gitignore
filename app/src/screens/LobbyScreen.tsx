import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import type { GameView } from '../shared/protocol';
import { Button } from '../components/Button';
import { joinUrl } from '../deeplink';
import { theme } from '../theme';

interface Props {
  view: GameView;
  onStart: () => void;
  onLeave: () => void;
}

export function LobbyScreen({ view, onStart, onLeave }: Props) {
  const you = view.players.find((p) => p.id === view.youId);
  const isHost = you?.isHost ?? false;
  const enough = view.players.length >= 2;

  // Вэб дээр линк дарахад шууд орох боломжтой; native дээр код л илгээнэ.
  const link = joinUrl(view.code);
  const share = () => {
    void Share.share({
      message: link
        ? `Дай Ди тоглоом! Линк дарахад шууд орно:\n${link}`
        : `Дай Ди тоглоом! Өрөөний код: ${view.code}`,
    });
  };

  return (
    <View style={styles.container}>
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
        <Text style={styles.panelTitle}>Тоглогчид ({view.players.length}/4)</Text>
        {view.players.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: p.connected ? theme.success : theme.textMuted }]} />
            <Text style={styles.name}>
              {p.name}
              {p.id === view.youId ? ' (та)' : ''}
            </Text>
            {p.isHost && <Text style={styles.badge}>эзэн</Text>}
          </View>
        ))}
        {view.players.length < 2 && (
          <Text style={styles.hint}>Дор хаяж нэг найзаа хүлээж байна…</Text>
        )}
      </View>

      <View style={styles.actions}>
        {isHost ? (
          <Button title="Тоглоом эхлүүлэх" onPress={onStart} disabled={!enough} />
        ) : (
          <Text style={styles.hint}>Өрөөний эзэн эхлүүлэхийг хүлээж байна…</Text>
        )}
        <Button title="Өрөөнөөс гарах" variant="ghost" onPress={onLeave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  eyebrow: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 24 },
  code: {
    color: theme.accent,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 8,
  },
  panel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, gap: 12 },
  panelTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: theme.text, fontSize: 17, flex: 1 },
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
  hint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  link: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
  actions: { marginTop: 'auto', gap: 8 },
});
