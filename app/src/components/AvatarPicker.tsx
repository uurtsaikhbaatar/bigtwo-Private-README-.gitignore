/**
 * Профайлын зураг сонгох хэсэг — профайл цонхны дотор.
 *
 * Хоёр сонголт: апп доторх бэлэн дүрснүүд, эсвэл өөрийн зураг.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PhotoError, photoPickerSupported, pickAvatarPhoto } from '../photo';
import { AVATAR_PRESETS } from '../shared/avatar';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { theme } from '../theme';

interface Props {
  name: string;
  avatar: string | null;
  onChange: (avatar: string | null) => void;
}

export function AvatarPicker({ name, avatar, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    setError(null);
    setBusy(true);
    try {
      const photo = await pickAvatarPhoto();
      if (photo) onChange(photo);
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : 'Зураг оруулж чадсангүй.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Avatar name={name} avatar={avatar} size={56} />
        <View style={styles.headText}>
          <Text style={styles.title}>Профайлын зураг</Text>
          <Text style={styles.hint}>Бэлэн дүрс сонгох, эсвэл өөрийн зургаа оруулах.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {AVATAR_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            onPress={() => onChange(preset)}
            accessibilityRole="button"
            accessibilityLabel={`Дүрс ${preset}`}
            style={[styles.preset, avatar === preset && styles.presetActive]}
          >
            <Text style={styles.presetIcon}>{preset}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        {photoPickerSupported() && (
          <Button
            title={busy ? 'Уншиж байна…' : 'Зураг оруулах'}
            variant="secondary"
            onPress={upload}
            disabled={busy}
            style={styles.action}
          />
        )}
        {avatar !== null && (
          <Button
            title="Устгах"
            variant="ghost"
            onPress={() => onChange(null)}
            style={styles.action}
          />
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  row: { gap: 8, paddingVertical: 2 },
  preset: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetActive: { borderColor: theme.accent },
  presetIcon: { fontSize: 22 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  error: { color: theme.danger, fontSize: 12 },
});
