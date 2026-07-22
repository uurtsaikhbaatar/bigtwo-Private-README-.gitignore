/**
 * Найзаас ирсэн урилгууд — нүүр хуудсан дээр.
 *
 * Найзууд ихэвчлэн ижил хүмүүс байдаг тул тоглолт бүрд линк явуулах нь
 * төвөгтэй. Урилга нь апп дотор нь харагдаж, нэг товчоор өрөөнд оруулна.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Invite } from '../shared/protocol';
import { Button } from './Button';
import { theme } from '../theme';

interface Props {
  invites: Invite[];
  onAccept: (roomCode: string) => void;
  onDecline: (roomCode: string) => void;
}

export function InviteList({ invites, onAccept, onDecline }: Props) {
  if (invites.length === 0) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {invites.length === 1 ? 'Урилга ирлээ' : `${invites.length} урилга ирлээ`}
      </Text>

      {invites.map((invite) => (
        <View key={invite.id} style={styles.row}>
          <View style={styles.text}>
            <Text style={styles.from} numberOfLines={1}>
              {invite.from}
            </Text>
            <Text style={styles.hint}>урьж байна · {invite.roomCode}</Text>
          </View>

          <Button
            title="Орох"
            onPress={() => onAccept(invite.roomCode)}
            style={styles.accept}
          />
          <Pressable
            onPress={() => onDecline(invite.roomCode)}
            accessibilityRole="button"
            accessibilityLabel="Урилгыг хаах"
            style={styles.decline}
          >
            <Text style={styles.declineText}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(242,183,5,0.10)',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 12,
    gap: 10,
  },
  title: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, gap: 1 },
  from: { color: theme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: theme.textMuted, fontSize: 12 },
  accept: { paddingHorizontal: 18 },
  decline: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: theme.textMuted, fontSize: 16 },
});
