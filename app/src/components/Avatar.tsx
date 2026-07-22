/**
 * Тоглогчийн профайлын зураг.
 *
 * Гурван тохиолдол:
 *   • Өөрийн зураг (`data:image/…`) — дугуй болгож тайрч харуулна.
 *   • Бэлэн дүрс (emoji) — өнгөт дугуйн дотор.
 *   • Юу ч сонгоогүй — нэрний эхний үсэг, нэрнээс хамаарсан тогтмол өнгөөр.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { isPhoto } from '../shared/avatar';
import { theme } from '../theme';

/** Нэрнээс тогтмол өнгө гаргана — нэг хүн үргэлж нэг өнгөтэй байна. */
const TINTS = ['#7c4dff', '#00897b', '#c2185b', '#3949ab', '#ef6c00', '#00838f', '#5d4037'];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

interface Props {
  name: string;
  avatar: string | null;
  size?: number;
}

export function Avatar({ name, avatar, size = 32 }: Props) {
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (isPhoto(avatar)) {
    return (
      <Image
        source={{ uri: avatar! }}
        style={[styles.base, round]}
        accessibilityLabel={`${name}-ийн зураг`}
      />
    );
  }

  if (avatar) {
    return (
      <View style={[styles.base, styles.center, round, { backgroundColor: theme.surfaceRaised }]}>
        <Text style={{ fontSize: size * 0.55 }}>{avatar}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.base, styles.center, round, { backgroundColor: tintFor(name) }]}>
      <Text style={[styles.initial, { fontSize: size * 0.45 }]}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '800' },
});
