/**
 * "?" товч — цол хэрхэн авахыг товч тайлбарлана.
 *
 * Цонх нь ӨӨРӨӨ автоматаар хаагдана. Гэхдээ уншиж байхад нь хаачихвал
 * тааламжгүй тул: хугацааг товчин дээр харуулж, цонх дотор хүрэх бүрд
 * тоолуур эхнээсээ эхэлнэ. Ингэснээр уншсаар байгаа хүн хөөгдөхгүй.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { groupDigits } from '../chips';
import { RANKS, rankFor } from '../shared/ranks';
import { Overlay } from './Overlay';
import { theme } from '../theme';

/** Хэдэн секундын дараа өөрөө хаагдах вэ. */
const AUTO_CLOSE_SECONDS = 30;

interface Props {
  /** Уншиж буй хүний хожлын тоо — өөрийн цолыг тодруулна. Зочин бол null. */
  wins: number | null;
}

export function HelpButton({ wins }: Props) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(AUTO_CLOSE_SECONDS);
  // Хүрэх бүрд тоолуурыг эхлүүлэхийн тулд дугаарыг нь ахиулна.
  const [restart, setRestart] = useState(0);
  const closeRef = useRef(() => setOpen(false));
  closeRef.current = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    setLeft(AUTO_CLOSE_SECONDS);
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = AUTO_CLOSE_SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(remaining);
      if (remaining <= 0) closeRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [open, restart]);

  const mine = wins === null ? null : rankFor(wins);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Тусламж — цол хэрхэн авах вэ"
        style={styles.fab}
      >
        <Text style={styles.fabIcon}>?</Text>
      </Pressable>

      <Overlay visible={open} onClose={() => setOpen(false)}>
        <Pressable style={styles.sheet} onPress={() => setRestart((n) => n + 1)}>
          <View style={styles.header}>
            <Text style={styles.title}>Цол хэрхэн авах вэ?</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.close}>Хаах ({Math.max(0, left)})</Text>
            </Pressable>
          </View>

          {/* Хамгийн чухал нөхцөл — эхэнд нь тодруулж хэлнэ. Тоглогч бусдыг
              уншихгүй ч энэ хайрцгийг харна. */}
          <View style={styles.ruleBox}>
            <Text style={styles.ruleText}>
              <Text style={styles.ruleStrong}>Бүртгэлтэй</Text> тоглогч{' '}
              <Text style={styles.ruleStrong}>токентой</Text> тоглож{' '}
              <Text style={styles.ruleStrong}>хожсон</Text> тохиолдолд л цол авна.
            </Text>
          </View>

          <Text style={styles.lead}>
            Гурвуулаа биелэх ёстой. Зочноор тоглосон, токенгүй тоглосон, эсвэл
            зөвхөн тойрог хожсон бол цолд тоологдохгүй — тоглолтыг бүхэлд нь,
            сүүлчийн үлдсэн хүн байж хожих ёстой.
          </Text>
          <Text style={styles.lead}>
            Цол ахих бүрд токен шагнал автоматаар нэмэгдэнэ.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {RANKS.map((rank, i) => {
              const isMine = mine?.name === rank.name;
              const newGroup = i === 0 || RANKS[i - 1].group !== rank.group;
              return (
                <View key={rank.name}>
                  {newGroup && <Text style={styles.group}>{rank.group}</Text>}
                  <View style={[styles.row, isMine && styles.rowMine]}>
                    <Text style={styles.badge}>{rank.badge}</Text>
                    <Text style={[styles.name, isMine && styles.nameMine]} numberOfLines={1}>
                      {rank.name}
                      {isMine ? ' — та' : ''}
                    </Text>
                    <Text style={styles.wins}>
                      {rank.wins === 0 ? 'эхлэл' : `${rank.wins} хожил`}
                    </Text>
                    <Text style={styles.reward}>
                      {rank.reward > 0 ? `+${groupDigits(rank.reward)}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Text style={styles.footer}>
            Баруун талын тоо нь цол ахихад шагнагдах токен. Цол ахих бүрд чатад
            зарлагдана. Дэлгэц дээр хүрвэл энэ цонх дахин 30 секунд нээлттэй байна.
          </Text>
        </Pressable>
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 122,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fabIcon: { color: theme.textMuted, fontSize: 20, fontWeight: '800' },

  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 10,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 14 },
  lead: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  ruleBox: {
    backgroundColor: 'rgba(242,183,5,0.12)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 12,
  },
  ruleText: { color: theme.text, fontSize: 14, lineHeight: 21 },
  ruleStrong: { color: theme.accent, fontWeight: '800' },

  list: { flexGrow: 0 },
  listContent: { gap: 2, paddingBottom: 4 },
  group: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  rowMine: { backgroundColor: 'rgba(242,183,5,0.12)' },
  badge: { color: theme.accent, fontSize: 11, width: 34 },
  name: { color: theme.text, fontSize: 13, flex: 1 },
  nameMine: { fontWeight: '800' },
  wins: { color: theme.textMuted, fontSize: 12, width: 74, textAlign: 'right' },
  reward: { color: theme.accent, fontSize: 12, width: 78, textAlign: 'right' },

  footer: { color: theme.textMuted, fontSize: 11, lineHeight: 16 },
});
