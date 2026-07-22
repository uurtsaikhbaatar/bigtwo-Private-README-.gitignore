import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

/** Энэ хугацаанаас доош улаан болж анхааруулна. */
const WARNING_SECONDS = 5;

/**
 * Ээлжийн үлдсэн хугацааг тоолно.
 *
 * Сервер үнэмлэхүй цаг биш, ҮЛДСЭН хугацааг илгээдэг тул клиент, серверийн
 * цагийн зөрүү нөлөөлөхгүй.
 *
 * `turnSeq` заавал хэрэгтэй: ээлж бүр яг ижил хугацаанаас (жишээ нь 30000ms)
 * эхэлдэг тул зөвхөн `remainingMs`-ээр бол React хамаарал өөрчлөгдөөгүй гэж
 * үзээд тоолуурыг дахин эхлүүлэхгүй — цаг эхний ээлжээс үргэлжлээд явна.
 */
export function useTurnCountdown(remainingMs: number | null, turnSeq: number): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (remainingMs === null) {
      setSecondsLeft(null);
      return;
    }
    const endsAt = Date.now() + remainingMs;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnSeq, remainingMs === null]);

  return secondsLeft;
}

interface Props {
  secondsLeft: number | null;
  /** Тухайн ээлж энэ хэрэглэгчийнх эсэх — илүү тод харуулна. */
  yours?: boolean;
  compact?: boolean;
}

export function TurnTimer({ secondsLeft, yours, compact }: Props) {
  if (secondsLeft === null) return null;
  const warning = secondsLeft <= WARNING_SECONDS;

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        yours && styles.pillYours,
        warning && styles.pillWarning,
      ]}
    >
      <Text
        style={[styles.text, compact && styles.textCompact, warning && styles.textWarning]}
        accessibilityLabel={`${secondsLeft} секунд үлдлээ`}
      >
        {secondsLeft}с
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillCompact: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  pillYours: { borderColor: theme.accent },
  pillWarning: { backgroundColor: theme.danger, borderColor: theme.danger },
  text: { color: theme.text, fontSize: 14, fontWeight: '800' },
  textCompact: { fontSize: 11 },
  textWarning: { color: theme.text },
});
