/**
 * Микрофон ба зогсоох дүрс.
 *
 * Emoji (🎤) нь төхөөрөмж бүр дээр өөр өөрөөр, ихэвчлэн бүдүүлэг харагддаг тул
 * энгийн `View`-гээр өөрсдөө зурав. Шинэ сан нэмэх шаардлагагүй, вэб болон
 * төрөлхийн платформ дээр адилхан гарна.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  /** Дүрсний өнгө. */
  color?: string;
  /** Ерөнхий өндөр (px). Бусад хэмжээ үүнээс хамаарна. */
  size?: number;
}

export function MicIcon({ color = '#fff', size = 20 }: Props) {
  const unit = size / 20;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Толгой — дугуйрсан капсул */}
      <View
        style={{
          width: 7 * unit,
          height: 11 * unit,
          borderRadius: 3.5 * unit,
          backgroundColor: color,
        }}
      />
      {/* Тэврэх нум — доод хагас нь л харагдана */}
      <View
        style={{
          width: 13 * unit,
          height: 7 * unit,
          marginTop: -3 * unit,
          borderWidth: 1.6 * unit,
          borderColor: color,
          borderTopColor: 'transparent',
          borderBottomLeftRadius: 7 * unit,
          borderBottomRightRadius: 7 * unit,
        }}
      />
      {/* Иш ба суурь */}
      <View style={{ width: 1.6 * unit, height: 2.5 * unit, backgroundColor: color }} />
      <View
        style={{
          width: 8 * unit,
          height: 1.6 * unit,
          borderRadius: unit,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Бичлэг зогсоох — дугуйрсан дөрвөлжин. */
export function StopIcon({ color = '#fff', size = 20 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: size * 0.12,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
