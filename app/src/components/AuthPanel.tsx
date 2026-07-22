import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '../components/Button';
import type { Account, MatchSummary, PlayerStats } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  account: Account | null;
  profile: { stats: PlayerStats; matches: MatchSummary[] } | null;
  onRegister: (username: string, password: string) => void;
  onLogin: (username: string, password: string) => void;
  onLogout: () => void;
  onLoadProfile: () => void;
}

/**
 * Бүртгэл, нэвтрэлт, профайл — нэг цонхонд.
 * Нэвтрэхгүйгээр зочноор тоглох боломж хэвээр байдаг тул заавал биш.
 */
export function AuthPanel({
  account,
  profile,
  onRegister,
  onLogin,
  onLogout,
  onLoadProfile,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Нэвтэрсний дараа (эсвэл цонх нээгдэхэд) профайлыг автоматаар татна.
  const needsProfile = open && Boolean(account) && profile === null;
  useEffect(() => {
    if (needsProfile) onLoadProfile();
  }, [needsProfile, onLoadProfile]);

  const openPanel = () => {
    setOpen(true);
    if (account) onLoadProfile();
  };

  const submit = () => {
    const name = username.trim();
    if (!name || !password) return;
    if (mode === 'register') onRegister(name, password);
    else onLogin(name, password);
    setPassword('');
  };

  return (
    <>
      <Pressable onPress={openPanel} accessibilityRole="button" style={styles.trigger}>
        <Text style={styles.triggerText}>
          {account ? `👤 ${account.username}` : 'Нэвтрэх / Бүртгүүлэх'}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdropFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{account ? 'Профайл' : 'Бүртгэл'}</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                <Text style={styles.close}>Хаах</Text>
              </Pressable>
            </View>

            {account ? (
              <ScrollView contentContainerStyle={styles.profileBody}>
                <Text style={styles.who}>{account.username}</Text>

                {profile ? (
                  <>
                    <View style={styles.statRow}>
                      <Stat label="Тоглолт" value={profile.stats.matches} />
                      <Stat label="Ялалт" value={profile.stats.wins} />
                      <Stat
                        label="Чип"
                        value={profile.stats.chips}
                        tone={profile.stats.chips >= 0 ? 'good' : 'bad'}
                      />
                      <Stat label="🐉 Луу" value={profile.stats.dragons} />
                    </View>

                    <Text style={styles.sectionTitle}>Сүүлийн тоглолтууд</Text>
                    {profile.matches.length === 0 && (
                      <Text style={styles.empty}>Хараахан тоглолт алга.</Text>
                    )}
                    {profile.matches.map((match) => (
                      <View key={match.id} style={styles.match}>
                        <View style={styles.matchTop}>
                          <Text style={[styles.matchResult, match.won ? styles.won : styles.lost]}>
                            {match.won ? 'Хожсон' : 'Хожигдсон'}
                          </Text>
                          {match.dragon && <Text style={styles.matchDragon}>🐉</Text>}
                          <Text style={styles.matchMeta}>
                            {match.rounds} тойрог · {formatDate(match.finishedAt)}
                          </Text>
                          {match.stake > 0 && (
                            <Text style={[styles.matchChips, match.chips >= 0 ? styles.won : styles.lost]}>
                              {match.chips > 0 ? `+${match.chips}` : match.chips} чип
                            </Text>
                          )}
                        </View>
                        <Text style={styles.matchPlayers} numberOfLines={1}>
                          {match.players.map((p) => `${p.name} ${p.score}`).join(' · ')}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.empty}>Ачаалж байна…</Text>
                )}

                <Button title="Гарах" variant="ghost" onPress={onLogout} />
              </ScrollView>
            ) : (
              <View style={styles.formBody}>
                <View style={styles.tabs}>
                  {(['login', 'register'] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setMode(option)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: mode === option }}
                      style={[styles.tab, mode === option && styles.tabActive]}
                    >
                      <Text style={[styles.tabText, mode === option && styles.tabTextActive]}>
                        {option === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Хэрэглэгчийн нэр"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Нууц үг"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                  onSubmitEditing={submit}
                />

                <Button
                  title={mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх'}
                  onPress={submit}
                  disabled={!username.trim() || !password}
                />
                <Text style={styles.hint}>
                  Бүртгүүлэхгүйгээр зочноор тоглож болно. Бүртгэлтэй бол тоглолтын түүх,
                  статистик хадгалагдана.
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad';
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          styles.statValue,
          tone === 'good' && styles.won,
          tone === 'bad' && styles.lost,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  trigger: { paddingVertical: 10, alignItems: 'center' },
  triggerText: { color: theme.accent, fontSize: 14, fontWeight: '600' },

  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 15 },

  formBody: { paddingHorizontal: 16, gap: 10 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#1d7a52' },
  tabText: { color: theme.textMuted, fontWeight: '700' },
  tabTextActive: { color: theme.text },
  input: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    color: theme.text,
    fontSize: 16,
  },
  hint: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },

  profileBody: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  who: { color: theme.accent, fontSize: 20, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { color: theme.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: theme.textMuted, fontSize: 11 },
  sectionTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  empty: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  match: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  matchTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchResult: { fontSize: 13, fontWeight: '800' },
  matchDragon: { fontSize: 13 },
  matchMeta: { color: theme.textMuted, fontSize: 11, flex: 1 },
  matchChips: { fontSize: 13, fontWeight: '700' },
  matchPlayers: { color: theme.textMuted, fontSize: 11 },
  won: { color: theme.success },
  lost: { color: theme.danger },
});
