/**
 * Рекламын байрлал.
 *
 * Зөвхөн ТОГЛООМД СААД БОЛОХГҮЙ хэсэгт гарна: лобби (найзаа хүлээх үед) ба
 * тойргийн дүн (оноо харах үед). Тоглох дэлгэцэд огт гарахгүй — тэнд хөзөр,
 * товчнууд хөндлөн утсан дээр яг таг багтдаг тул зурвас нэмбэл шахагдана.
 *
 * Реклам нь зурагтай, зөвхөн текстээр, эсвэл хоёулангаараа байж болно.
 * Олон реклам байвал ээлжлэн солигдоно.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AdView } from '../shared/protocol';
import { theme } from '../theme';

/** Нэг реклам хэдэн секунд харагдах вэ. */
const ROTATE_MS = 12_000;

interface Props {
  ads: AdView[];
  /** Зургийн үндсэн хаяг, жишээ нь https://daidi13.com */
  httpBase: string;
  onEvent: (id: string, kind: 'seen' | 'click') => void;
  /** Зургийн өндөр — лоббид том, дүнгийн дэлгэцэд нам. */
  height?: number;
}

export function AdSlot({ ads, httpBase, onEvent, height = 90 }: Props) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  // Реклам солигдоход эргэлтийг эхнээс нь эхлүүлнэ.
  useEffect(() => setIndex(0), [ads.length]);

  useEffect(() => {
    if (ads.length < 2) return;
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      // Бүдгэрсэн мөчид солино — үсрэлт харагдахгүй.
      setTimeout(() => setIndex((i) => (i + 1) % ads.length), 240);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [ads.length, fade]);

  const ad = ads[index];

  // Харагдсаныг нэг л удаа тоолно.
  useEffect(() => {
    if (ad) eventRef.current(ad.id, 'seen');
  }, [ad?.id]);

  if (!ad) return null;

  const open = () => {
    eventRef.current(ad.id, 'click');
    if (ad.link) void Linking.openURL(ad.link).catch(() => undefined);
  };

  return (
    <Animated.View style={[styles.box, { opacity: fade }]}>
      <Pressable
        onPress={open}
        disabled={!ad.link}
        accessibilityRole={ad.link ? 'link' : 'text'}
        accessibilityLabel={ad.title}
        style={styles.press}
      >
        {ad.hasImage && (
          <View style={{ height }}>
            <Image
              source={{ uri: `${httpBase}/ads/image/${ad.id}` }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={ad.title}
            />
          </View>
        )}

        {/* Текст нь зурагтай хамт байвал доор нь гарна. */}
        {ad.text && (
          <View style={[styles.textBox, ad.hasImage && styles.textUnderImage]}>
            <Text style={styles.title} numberOfLines={1}>
              {ad.title}
            </Text>
            <Text style={styles.body} numberOfLines={3}>
              {ad.text}
            </Text>
            {ad.link && <Text style={styles.cta}>Дэлгэрэнгүй →</Text>}
          </View>
        )}
      </Pressable>

      <Text style={styles.label}>реклам</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: theme.surfaceRaised,
  },
  press: { width: '100%' },
  image: { width: '100%', height: '100%' },

  textBox: { paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  textUnderImage: { paddingTop: 8 },
  title: { color: theme.text, fontSize: 15, fontWeight: '800' },
  body: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  cta: { color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 2 },

  label: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    color: theme.textMuted,
    fontSize: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
});

/** Хоосон зай эзлэхгүйн тулд реклам байхгүй бол огт гаргахгүй. */
export function hasAds(ads: AdView[] | null | undefined): ads is AdView[] {
  return Array.isArray(ads) && ads.length > 0;
}
