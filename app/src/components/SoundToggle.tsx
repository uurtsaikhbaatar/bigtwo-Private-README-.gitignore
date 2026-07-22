/**
 * Дуу асаах/унтраах товч.
 *
 * Анхдагчаар АСААЛТТАЙ: унтраалттай байвал хэн ч энэ товчийг олохгүй, ёслолын
 * дуу хэзээ ч сонсогдохгүй. Сонголтыг төхөөрөмж дээр санана — нэг л удаа
 * унтраахад хангалттай.
 *
 * Мөн хэрэглэгчийн эхний хүрэлтээр дууны хөдөлгүүрийг сэрээнэ: хөтөч нь
 * жинхэнэ үйлдэлгүйгээр дуу тоглуулахыг хориглодог.
 */

import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { setMuted, soundSupported, unlockAudio } from '../salute';
import { loadMuted, saveMuted } from '../storage';
import { theme } from '../theme';

export function SoundToggle() {
  const [muted, setLocalMuted] = useState(false);

  useEffect(() => {
    void loadMuted().then((value) => {
      setLocalMuted(value);
      setMuted(value);
    });
  }, []);

  // Ямар ч хүрэлтээр дууны зөвшөөрлийг авна — ёслол болох үед оройтсон байна.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const wake = () => unlockAudio();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  if (!soundSupported()) return null;

  const toggle = () => {
    const next = !muted;
    setLocalMuted(next);
    setMuted(next);
    void saveMuted(next);
    if (!next) unlockAudio();
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Дуу асаах' : 'Дуу унтраах'}
      style={styles.fab}
    >
      <Text style={styles.icon}>{muted ? '🔇' : '🔊'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 168,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  icon: { fontSize: 17 },
});
