/**
 * Хожлын баяр — хожигч сүүлийн хөзрөө тавьж тойрог/тоглолт хожиход.
 *
 * Дэлгэц дүүрэн ӨНГӨТ ТҮҮЗ (серпантин) унаж, дунд нь "гилэн тамга" мэт
 * "ХОЖЛОО!" тэмдэг цохилон гарч ирнэ. Хэдэн секундын дараа өөрөө арилна.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { playSalute } from '../salute';
import { theme } from '../theme';

/** Баяр хэдэн миллисекунд үргэлжлэх вэ. */
export const WIN_CELEBRATION_MS = 4200;

const STREAMER_COUNT = 18;
const COLORS = ['#f2b705', '#e2574c', '#4ade80', '#3b82f6', '#a855f7', '#ec4899', '#22d3ee'];

interface Props {
  /** Хожсон тоглогчийн нэр. */
  name: string;
  /** Хожсон нь энэ төхөөрөмжийн эзэн эсэх. */
  mine: boolean;
  /** Тоглолт бүхэлдээ дуусч хожсон эсэх (тойрог биш). */
  match: boolean;
  onDone: () => void;
}

export function WinCelebration({ name, mine, match, onDone }: Props) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const streamers = useRef(
    Array.from({ length: STREAMER_COUNT }, () => new Animated.Value(0)),
  ).current;
  const stampScale = useRef(new Animated.Value(0)).current;
  const stampRot = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    playSalute(mine);

    // Түүзнүүд дээрээс унаж, хажуу тийш найгана.
    Animated.parallel(
      streamers.map((s, i) =>
        Animated.sequence([
          Animated.delay((i % 9) * 70),
          Animated.timing(s, {
            toValue: 1,
            duration: 2600 + (i % 5) * 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ).start();

    // Тамга цохилон буух — эргэлдэж, үсрэн томорно.
    Animated.sequence([
      Animated.delay(160),
      Animated.parallel([
        Animated.spring(stampScale, { toValue: 1, friction: 4, tension: 130, useNativeDriver: true }),
        Animated.timing(stampRot, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Гилэн туяа — тамга дээгүүр давтан гүйж, фойл мэт гялалзуулна.
    Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(shine, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();

    const id = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 420, useNativeDriver: true }).start(() =>
        doneRef.current(),
      );
    }, WIN_CELEBRATION_MS - 420);
    return () => clearTimeout(id);
  }, [streamers, stampScale, stampRot, shine, fade, mine]);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      {streamers.map((s, i) => {
        const leftPct = (i / STREAMER_COUNT) * 100;
        const color = COLORS[i % COLORS.length];
        const sway = (i % 2 ? 1 : -1) * (24 + (i % 4) * 12);
        return (
          <Animated.View
            key={i}
            style={[
              styles.streamer,
              {
                left: `${leftPct}%`,
                backgroundColor: color,
                height: 60 + (i % 4) * 26,
                opacity: s.interpolate({
                  inputRange: [0, 0.08, 0.9, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  { translateY: s.interpolate({ inputRange: [0, 1], outputRange: [-320, 960] }) },
                  {
                    translateX: s.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, sway, 0],
                    }),
                  },
                  {
                    rotate: s.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${sway * 5}deg`],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}

      <Animated.View
        style={[
          styles.stamp,
          {
            transform: [
              { scale: stampScale },
              { rotate: stampRot.interpolate({ inputRange: [0, 1], outputRange: ['26deg', '-9deg'] }) },
            ],
          },
        ]}
      >
        {/* Гилэн туяа — цагаан ташуу зурвас тамга дээгүүр гүйнэ. */}
        <Animated.View
          style={[
            styles.shine,
            {
              opacity: shine.interpolate({
                inputRange: [0, 0.2, 0.8, 1],
                outputRange: [0, 0.85, 0.85, 0],
              }),
              transform: [
                { rotate: '24deg' },
                { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-220, 220] }) },
              ],
            },
          ]}
        />
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.won}>ХОЖЛОО!</Text>
        <Text style={styles.name} numberOfLines={1}>
          {mine ? 'ТА' : name}
        </Text>
        {match && (
          <View style={styles.matchTag}>
            <Text style={styles.matchText}>Тоглолтын аварга</Text>
          </View>
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
    backgroundColor: 'rgba(4,12,24,0.55)',
    overflow: 'hidden',
    zIndex: 2100,
  },
  streamer: {
    position: 'absolute',
    top: 0,
    width: 9,
    borderRadius: 4,
  },
  // "Гилэн тамга" — алтан фойл, бүрзгэр хүрээтэй, гэрэлтэн эргэсэн тэмдэг.
  stamp: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 34,
    paddingVertical: 22,
    borderRadius: 18,
    backgroundColor: '#e7b52c',
    borderWidth: 4,
    borderColor: '#8a5a00',
    overflow: 'hidden', // гилэн туяаг хүрээнд нь таслана
    shadowColor: theme.accent,
    shadowOpacity: 0.7,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    maxWidth: '86%',
  },
  // Цагаан ташуу зурвас — тамга дээгүүр гүйж фойл гялбаа өгнө.
  shine: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 46,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  trophy: { fontSize: 44 },
  won: {
    color: '#3a2600',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 3,
  },
  name: { color: '#231700', fontSize: 20, fontWeight: '800', marginTop: 2 },
  matchTag: {
    marginTop: 8,
    backgroundColor: '#3a2600',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  matchText: { color: '#f7dd8a', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
