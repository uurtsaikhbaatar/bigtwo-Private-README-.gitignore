import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { groupDigits } from '../chips';
import { AvatarPicker } from './AvatarPicker';
import { RankBadge } from './RankBadge';
import { Button } from '../components/Button';
import type { Account, MatchSummary, PlayerStats } from '../shared/protocol';
import { nextRank, rankFor } from '../shared/ranks';
import { Overlay } from './Overlay';
import { theme } from '../theme';

/** Энэ хэмжээнээс доош унавал "токен хүсэх" товчийг харуулна. */
const LOW_TOKENS = 50_000;

interface Props {
  account: Account | null;
  profile: { stats: PlayerStats; matches: MatchSummary[] } | null;
  onRegister: (username: string, password: string, email: string) => void;
  onLogin: (username: string, password: string) => void;
  onLogout: () => void;
  onLoadProfile: () => void;
  onVerifyEmail: (code: string) => void;
  onResendCode: () => void;
  onRequestTokens: () => void;
  onSetAvatar: (avatar: string | null) => void;
  onForgotPassword: (email: string) => void;
  onResetPassword: (email: string, code: string, password: string) => void;
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
  onVerifyEmail,
  onResendCode,
  onRequestTokens,
  onSetAvatar,
  onForgotPassword,
  onResetPassword,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  // Сэргээх хоёр шат: код хүсэх → код + шинэ нууц үг оруулах.
  const [resetSent, setResetSent] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Нэвтэрсний дараа (эсвэл цонх нээгдэхэд) профайлыг автоматаар татна.
  const verifying = Boolean(account && account.email && !account.emailVerified);
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
    if (mode === 'register') onRegister(name, password, email.trim());
    else onLogin(name, password);
    setPassword('');
  };

  return (
    <>
      <Pressable onPress={openPanel} accessibilityRole="button" style={styles.trigger}>
        <Text style={styles.triggerText}>
          {account ? `👤 ${account.username}` : 'Бүртгүүлэх / Нэвтрэх'}
        </Text>
      </Pressable>

      <Overlay visible={open} onClose={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {account ? 'Профайл' : 'Бүртгэл'}
              </Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                <Text style={styles.close}>Хаах</Text>
              </Pressable>
            </View>

            {account ? (
              <ScrollView contentContainerStyle={styles.profileBody}>
                <Text style={styles.who}>{account.username}</Text>

                <AvatarPicker
                  name={account.username}
                  avatar={account.avatar}
                  onChange={onSetAvatar}
                />

                {/* Баталгаажуулалт нь профайлыг ХААХГҮЙ — дээд талд сануулга
                    болж гарна. Имэйл ирээгүй ч токен, түүхээ харж, тоглож
                    болно. */}
                {verifying && (
                  <View style={styles.verifyBox}>
                    <Text style={styles.verifyTitle}>Имэйлээ баталгаажуулна уу</Text>
                    <Text style={styles.hint}>
                      <Text style={styles.verifyEmail}>{account.email}</Text> хаяг руу 6 оронтой
                      код илгээлээ. Спам хавтсаа ч шалгаарай.
                    </Text>
                    <TextInput
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.input, styles.codeInput]}
                      keyboardType="number-pad"
                      maxLength={6}
                      onSubmitEditing={() => code.length === 6 && onVerifyEmail(code)}
                    />
                    <Button
                      title="Баталгаажуулах"
                      onPress={() => onVerifyEmail(code)}
                      disabled={code.length !== 6}
                    />
                    <Button title="Кодыг дахин илгээх" variant="ghost" onPress={onResendCode} />
                  </View>
                )}

                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>Токены үлдэгдэл</Text>
                  <Text style={styles.tokenValue}>{groupDigits(account.tokens)}</Text>
                  {account.tokens < LOW_TOKENS && (
                    <>
                      <Text style={styles.tokenLow}>Токен дуусах дөхлөө.</Text>
                      <Button title="Токен хүсэх" variant="secondary" onPress={onRequestTokens} />
                    </>
                  )}
                  <Text style={styles.tokenNote}>
                    Токен нь виртуал тоглоомын оноо — бодит мөнгө биш.
                  </Text>
                </View>

                {profile ? (
                  <>
                    <RankCard wins={profile.stats.rankedWins} />

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
                              {match.chips > 0 ? '+' : ''}{groupDigits(match.chips)}
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

                {mode === 'forgot' ? (
                  <ForgotForm
                    email={email}
                    onEmailChange={setEmail}
                    code={code}
                    onCodeChange={setCode}
                    password={password}
                    onPasswordChange={setPassword}
                    sent={resetSent}
                    onSend={() => {
                      onForgotPassword(email.trim());
                      setResetSent(true);
                    }}
                    onReset={() => onResetPassword(email.trim(), code, password)}
                    onBack={() => {
                      setMode('login');
                      setResetSent(false);
                      setCode('');
                      setPassword('');
                    }}
                  />
                ) : (
                <>
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
                {mode === 'register' && (
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Имэйл хаяг"
                    placeholderTextColor={theme.textMuted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                )}
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
                  disabled={!username.trim() || !password || (mode === 'register' && !email.trim())}
                />
                {mode === 'login' && (
                  <Pressable onPress={() => setMode('forgot')} accessibilityRole="button">
                    <Text style={styles.forgotLink}>Нууц үгээ мартсан уу?</Text>
                  </Pressable>
                )}
                <Text style={styles.hint}>
                  Бүртгүүлэхгүйгээр зочноор тоглож болно. Бүртгэлтэй бол тоглолтын түүх,
                  статистик хадгалагдана.
                </Text>
                </>
                )}
              </View>
            )}
          </View>
      </Overlay>
    </>
  );
}

/**
 * Нууц үг сэргээх маягт.
 *
 * Хоёр шаттай: эхлээд имэйл рүү код илгээнэ, дараа нь код + шинэ нууц үг.
 * Хэрэглэгчийн НЭРИЙГ ч имэйлээр илгээдэг тул нэрээ мартсан хүн ч сэргээнэ.
 */
function ForgotForm({
  email,
  onEmailChange,
  code,
  onCodeChange,
  password,
  onPasswordChange,
  sent,
  onSend,
  onReset,
  onBack,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  sent: boolean;
  onSend: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Text style={styles.forgotTitle}>Нууц үг сэргээх</Text>
      <Text style={styles.hint}>
        Бүртгүүлэхдээ оруулсан имэйл хаягаа бичнэ үү. Сэргээх код болон
        хэрэглэгчийн нэрийг тань тийш илгээнэ.
      </Text>

      <TextInput
        value={email}
        onChangeText={onEmailChange}
        placeholder="Имэйл хаяг"
        placeholderTextColor={theme.textMuted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!sent}
      />

      {!sent ? (
        <Button title="Код илгээх" onPress={onSend} disabled={!email.trim()} />
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={(t) => onCodeChange(t.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.codeInput]}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            placeholder="Шинэ нууц үг"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            title="Нууц үг солих"
            onPress={onReset}
            disabled={code.length !== 6 || password.length < 6}
          />
          <Button title="Кодыг дахин илгээх" variant="ghost" onPress={onSend} />
        </>
      )}

      <Button title="Буцах" variant="ghost" onPress={onBack} />
    </>
  );
}

/** Одоогийн цол ба дараагийн цол хүртэлх явц. */
function RankCard({ wins }: { wins: number }) {
  const rank = rankFor(wins);
  const next = nextRank(wins);
  const previous = rank.wins;
  // Явцын судал: энэ цолноос дараагийн цол хүртэлх зай.
  const span = next ? next.rank.wins - previous : 1;
  const done = next ? (wins - previous) / span : 1;

  return (
    <View style={styles.rankBox}>
      <View style={styles.rankTop}>
        <Text style={styles.rankName}>{rank.name}</Text>
        <RankBadge wins={wins} />
      </View>
      <View style={styles.rankTrack}>
        <View style={[styles.rankFill, { width: `${Math.min(100, done * 100)}%` }]} />
      </View>
      <Text style={styles.rankHint}>
        {next
          ? `${next.rank.name} цол хүртэл ${next.remaining} хожил үлдлээ` +
            (next.rank.reward > 0 ? ` · шагнал ${groupDigits(next.rank.reward)} токен` : '')
          : 'Хамгийн дээд цолд хүрлээ 🎖'}
      </Text>
      <Text style={styles.rankHint}>
        Чиптэй тоглолтын хожил: {wins}. Чипгүй тоглолт цолд тоологдохгүй.
      </Text>
    </View>
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
  verifyBox: {
    backgroundColor: 'rgba(242,183,5,0.10)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 12,
    gap: 8,
  },
  verifyTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  verifyEmail: { color: theme.accent, fontWeight: '700' },
  codeInput: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
  },

  profileBody: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  who: { color: theme.accent, fontSize: 20, fontWeight: '800' },
  tokenBox: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  tokenLabel: { color: theme.textMuted, fontSize: 12 },
  tokenValue: { color: theme.text, fontSize: 24, fontWeight: '800' },
  tokenLow: { color: theme.danger, fontSize: 12, fontWeight: '700' },
  tokenNote: { color: theme.textMuted, fontSize: 10, fontStyle: 'italic' },
  forgotTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  forgotLink: { color: theme.accent, fontSize: 13, textAlign: 'center', paddingVertical: 6 },

  rankBox: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rankTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankName: { color: theme.text, fontSize: 16, fontWeight: '800' },
  rankTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  rankFill: { height: 6, borderRadius: 3, backgroundColor: theme.accent },
  rankHint: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
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
