/**
 * Доороос гарч ирэх цонхны давхарга.
 *
 * React Native-ийн `Modal`-ыг вэб дээр ашиглахад цонх нь үндсэн агуулгын ДООР,
 * дэлгэцээс гадуур байрлаж байсан (`body { overflow: hidden }` тул гүйлгэж ч
 * очих аргагүй). Тоглогч чат нээгээд буцаж чадахгүй болсон нь үүнээс.
 *
 * Тиймээс Modal-ын оронд өөрсдөө байрлуулна: вэб дээр `position: fixed` нь
 * дэлгэцийн хүрээнд наалддаг тул эцэг элемент нь хаана ч байсан зөв гарна.
 */

import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Overlay({ visible, onClose, children }: Props) {
  // Вэб дээр Esch дарж хаана — Modal-ын оронд өөрсдөө хийх ёстой болсон.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Хаах" />
      <View style={styles.sheetWrap}>{children}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    // Вэб дээр дэлгэцэд наана; төрөлхийн платформд эцэг элементэд наана.
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'],
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  fill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: { width: '100%' },
});
