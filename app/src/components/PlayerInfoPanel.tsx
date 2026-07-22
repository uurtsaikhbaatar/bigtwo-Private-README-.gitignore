/**
 * Тоглогчийн нэр дээр дарахад гарах мэдээллийн цонх.
 *
 * Токен, тоглосон тоо, хожсон тоо зэрэг ил мэдээллийг харуулна. Хөзөр,
 * нууц үг зэрэг нууц зүйл энд ХЭЗЭЭ Ч ирдэггүй — сервер зөвхөн ил талбарыг
 * илгээнэ.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { groupDigits } from '../chips';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Overlay } from './Overlay';
import { RankBadge } from './RankBadge';
import type { PlayerInfo } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  /** Хүлээгдэж буй тоглогчийн нэр (хариу ирэхээс өмнө харуулна). */
  pendingName: string | null;
  info: PlayerInfo | null;
  onClose: () => void;
}

export function PlayerInfoPanel({ pendingName, info, onClose }: Props) {
  const visible = pendingName !== null;
  const loading = visible && info === null;

  return (
    <Overlay visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Avatar name={info?.name ?? pendingName ?? '?'} avatar={info?.avatar ?? null} size={40} />
            <View style={styles.titleText}>
              <Text style={styles.title}>{info?.name ?? pendingName ?? ''}</Text>
              {info?.stats && <RankBadge wins={info.stats.rankedWins} full />}
            </View>
          </View>
          <Text style={styles.close} onPress={onClose}>
            Хаах
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : info ? (
          <View style={styles.body}>
            <View style={styles.row}>
              <Stat label="Энэ тоглолтын оноо" value={String(info.score)} />
              {info.eliminated && <Text style={styles.out}>хасагдсан</Text>}
            </View>

            {info.registered ? (
              <>
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>Токен</Text>
                  <Text style={styles.tokenValue}>{groupDigits(info.tokens ?? 0)}</Text>
                </View>

                <View style={styles.row}>
                  <Stat label="Тоглолт" value={String(info.stats?.matches ?? 0)} />
                  <Stat label="Ялалт" value={String(info.stats?.wins ?? 0)} />
                  <Stat label="🐉 Луу" value={String(info.stats?.dragons ?? 0)} />
                </View>

                <Text style={styles.note}>
                  Хожсон/алдсан чип: {groupDigits(info.stats?.chips ?? 0)}
                </Text>
              </>
            ) : (
              <Text style={styles.guest}>
                Зочноор тоглож байна — бүртгэлгүй тул токен, түүх хадгалагдахгүй.
              </Text>
            )}
          </View>
        ) : null}

        <Button title="Хаах" variant="secondary" onPress={onClose} />
      </View>
    </Overlay>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  titleText: { gap: 4, flexShrink: 1, alignItems: 'flex-start' },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 15 },
  loading: { paddingVertical: 32 },
  body: { gap: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stat: {
    flex: 1,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { color: theme.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  tokenBox: {
    backgroundColor: 'rgba(242,183,5,0.10)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 12,
  },
  tokenLabel: { color: theme.textMuted, fontSize: 12 },
  tokenValue: { color: theme.text, fontSize: 22, fontWeight: '800' },
  note: { color: theme.textMuted, fontSize: 12 },
  guest: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  out: { color: theme.danger, fontSize: 12, fontWeight: '700' },
});
