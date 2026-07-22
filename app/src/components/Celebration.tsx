/**
 * Цол ахисны ёслол.
 *
 * Цол авсан хүнд бүтэн дэлгэцийн ёслол, бусдад дээд талд жижиг мөр — учир нь
 * найз чинь цол авахад чиний дэлгэц дүүрэн хучигдвал, яг тэр үед хөзрөө бодож
 * байсан бол эвгүй. Хоёулаа өөрөө арилна.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, type ViewStyle } from 'react-native';

import { groupDigits } from '../chips';
import { playSalute } from '../salute';
import type { Promotion } from '../shared/protocol';
import { theme } from '../theme';

/** Ёслол хэдэн миллисекунд үргэлжлэх вэ. */
export const CELEBRATION_MS = 5200;
const BANNER_MS = 3400;

/** Дээш хийсэх очны тоо. */
const SPARK_COUNT = 18;

interface Props {
  promotion: Promotion;
  /** Цол авсан хүн энэ төхөөрөмж дээр байгаа эсэх. */
  mine: boolean;
  onDone: () => void;
}

export function Celebration({ promotion, mine, onDone }: Props) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    playSalute(mine);
    const id = setTimeout(() => doneRef.current(), mine ? CELEBRATION_MS : BANNER_MS);
    return () => clearTimeout(id);
  }, [mine, promotion.playerId]);

  return mine ? <FullCeremony promotion={promotion} /> : <Banner promotion={promotion} />;
}

/** Бусдын цол — дээд талд гулсаж гарах жижиг мөр. Тоглоомыг халхлахгүй. */
function Banner({ promotion }: { promotion: Promotion }) {
  const slide = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay(BANNER_MS - 800),
      Animated.timing(slide, { toValue: -60, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slide }] }]}
      pointerEvents="none"
    >
      <Text style={styles.bannerBadge}>{promotion.badge}</Text>
      <Text style={styles.bannerText} numberOfLines={1}>
        {promotion.name} — {promotion.rank} боллоо!
      </Text>
    </Animated.View>
  );
}

/** Өөрийн цол — бүтэн дэлгэцийн ёслол. */
function FullCeremony({ promotion }: { promotion: Promotion }) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;
  const sparks = useRef(
    Array.from({ length: SPARK_COUNT }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
    ]).start();

    // Очнууд гурван давалгаагаар хийснэ — гурван удаагийн буудлагатай тааруулав.
    const flights = sparks.map((spark, i) =>
      Animated.sequence([
        Animated.delay(Math.floor(i / 6) * 450 + (i % 6) * 40),
        Animated.timing(spark, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(flights).start();

    // Гарахдаа бүдгэрнэ.
    const id = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, CELEBRATION_MS - 450);
    return () => clearTimeout(id);
  }, [fade, scale, sparks]);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      {sparks.map((spark, i) => {
        // Очнууд дэлгэцийн доод хэсгээс дээш, хажуу тийш тарна.
        const drift = (i % 6) * 60 - 150;
        return (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              {
                opacity: spark.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                transform: [
                  {
                    translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [140, -260] }),
                  },
                  { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
                  { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [1.4, 0.4] }) },
                ],
              },
            ]}
          />
        );
      })}

      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <Text style={styles.badge}>{promotion.badge}</Text>
        <Text style={styles.congrats}>Баяр хүргэе!</Text>
        <Text style={styles.rank}>{promotion.rank.toUpperCase()}</Text>
        <Text style={styles.who}>{promotion.name}</Text>
        {promotion.reward > 0 && (
          <Text style={styles.reward}>+{groupDigits(promotion.reward)} токен</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const fixed = (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'];

const styles = StyleSheet.create({
  root: {
    position: fixed,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,12,24,0.72)',
    zIndex: 2000,
  },
  spark: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accent,
  },
  card: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderColor: theme.accent,
    maxWidth: '90%',
  },
  badge: { color: theme.accent, fontSize: 30, letterSpacing: 2 },
  congrats: { color: theme.textMuted, fontSize: 14, marginTop: 2 },
  rank: {
    color: theme.accent,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  who: { color: theme.text, fontSize: 16, fontWeight: '700' },
  reward: { color: theme.success, fontSize: 15, fontWeight: '800', marginTop: 6 },

  banner: {
    position: fixed,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(242,183,5,0.94)',
    zIndex: 2000,
  },
  bannerBadge: { color: '#20160a', fontSize: 13, fontWeight: '800' },
  bannerText: { color: '#20160a', fontSize: 14, fontWeight: '800', flexShrink: 1 },
});
