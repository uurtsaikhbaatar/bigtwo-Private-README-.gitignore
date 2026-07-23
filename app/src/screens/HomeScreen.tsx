import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthPanel } from '../components/AuthPanel';
import { InviteList } from '../components/InviteList';
import { Button } from '../components/Button';
import type { Invite } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  /** Нэвтрэлтийн самбарт дамжуулах бүх зүйл. */
  auth: React.ComponentProps<typeof AuthPanel>;
  name: string;
  onNameChange: (name: string) => void;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  connecting: boolean;
  /** Линкээр урьсан өрөөний код (`?code=…`). */
  initialCode?: string;
  /** Найзаас ирсэн урилгууд. */
  invites: Invite[];
  onAcceptInvite: (roomCode: string) => void;
  onDeclineInvite: (roomCode: string) => void;
  /** Зочноор тоглохыг сонгосон эсэх (App-д хадгалагдана). */
  guestReady: boolean;
  /** "Зочноор тоглох" дарахад — гейтийг хааж лобби руу оруулна. */
  onEnterGuest: () => void;
}

/**
 * Нүүр хуудас хоёр үе шаттай:
 *   1. ГЕЙТ — нэвтрээгүй, зочноор ч сонгоогүй бол эхлээд "Нэвтрэх / Бүртгүүлэх /
 *      Зочноор тоглох" гэсэн тод сонголт гаргана. Хэрэглэгч хэн болохоо мэдэхгүй
 *      андуурахаас сэргийлнэ.
 *   2. ЛОББИ — сонголт хийсний дараа өрөө үүсгэх/нэгдэх. Дээд талд "Нэвтэрсэн:
 *      нэр" эсвэл "Зочин: нэр" гэж тод харуулж, төлөв ойлгомжтой болно.
 */
export function HomeScreen({
  auth,
  name,
  onNameChange,
  serverUrl,
  onServerUrlChange,
  onCreate,
  onJoin,
  connecting,
  initialCode = '',
  invites,
  onAcceptInvite,
  onDeclineInvite,
  guestReady,
  onEnterGuest,
}: Props) {
  const [code, setCode] = useState(initialCode);
  const [showSettings, setShowSettings] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [guestName, setGuestName] = useState(name);

  const loggedIn = Boolean(auth.account);
  const entered = loggedIn || guestReady;
  const ready = name.trim().length > 0;
  const invited = initialCode.length === 6;

  const openAuth = (m: 'login' | 'register') => {
    setAuthMode(m);
    setAuthOpen(true);
  };

  // Гаднаас удирддаг нэвтрэлтийн цонх — гейт ба лобби хоёуланд хэрэгтэй.
  const authPanel = (
    <AuthPanel
      {...auth}
      open={authOpen}
      onOpenChange={setAuthOpen}
      initialMode={authMode}
      showTrigger={false}
    />
  );

  const hero = (
    <View style={styles.hero}>
      <Text style={styles.title}>Дай Ди</Text>
      <Text style={styles.subtitle}>Найзуудтайгаа хятад покер тоглох</Text>
    </View>
  );

  const serverSettings = (
    <>
      <Button
        title={showSettings ? 'Тохиргоог хаах' : 'Сервер тохиргоо'}
        variant="ghost"
        onPress={() => setShowSettings((v) => !v)}
      />
      {showSettings && (
        <View style={styles.panel}>
          <Text style={styles.label}>Серверийн хаяг</Text>
          <TextInput
            value={serverUrl}
            onChangeText={onServerUrlChange}
            placeholder="ws://192.168.1.10:8787"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            Ижил Wi-Fi сүлжээнд байгаа бол энэ хаяг автоматаар тохирно. Өөр газраас тоглох бол
            серверээ интернэтэд байршуулаад хаягийг нь энд бичнэ.
          </Text>
        </View>
      )}
    </>
  );

  // ── ГЕЙТ: эхлэх сонголт ──────────────────────────────────────────────
  if (!entered) {
    const enterGuest = () => {
      const trimmed = guestName.trim();
      if (!trimmed) return;
      onNameChange(trimmed);
      onEnterGuest();
    };
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {hero}

          {invited && (
            <View style={styles.invite}>
              <Text style={styles.inviteText}>
                Танийг <Text style={styles.inviteCode}>{initialCode}</Text> өрөөнд урьжээ
              </Text>
              <Text style={styles.inviteHint}>Доороос эхлээд нэвтэрч эсвэл зочноор нэгдээрэй</Text>
            </View>
          )}

          <View style={styles.panel}>
            <Text style={styles.gateTitle}>Тавтай морил 👋</Text>
            <Text style={styles.gateSub}>Хэрхэн тоглохоо сонгоно уу</Text>

            <Button title="Нэвтрэх" onPress={() => openAuth('login')} style={styles.spaced} />
            <Button
              title="Бүртгүүлэх"
              variant="secondary"
              onPress={() => openAuth('register')}
              style={styles.spaced}
            />

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>эсвэл</Text>
              <View style={styles.line} />
            </View>

            <Text style={styles.label}>Зочны нэр</Text>
            <TextInput
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Нэрээ бичнэ үү"
              placeholderTextColor={theme.textMuted}
              style={styles.input}
              maxLength={16}
              autoCapitalize="words"
              returnKeyType="go"
              onSubmitEditing={enterGuest}
            />
            <Button
              title="Зочноор тоглох"
              variant="secondary"
              onPress={enterGuest}
              disabled={!guestName.trim()}
              style={styles.spaced}
            />

            <Text style={styles.gateHint}>
              Бүртгэлтэй бол тоглолтын түүх, статистик, цол хадгалагдана. Зочноор бол шууд тоглож
              болох ч эдгээр хадгалагдахгүй.
            </Text>
          </View>

          {serverSettings}
        </ScrollView>
        {authPanel}
      </KeyboardAvoidingView>
    );
  }

  // ── ЛОББИ: өрөө үүсгэх / нэгдэх ───────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {hero}

        {/* Хэн болох нь тод — нэвтэрсэн эсвэл зочин. */}
        {loggedIn ? (
          <Pressable
            style={styles.idCard}
            onPress={() => setAuthOpen(true)}
            accessibilityRole="button"
          >
            <View style={styles.idLeft}>
              <Text style={[styles.idLabel, styles.idLabelIn]}>✓ Нэвтэрсэн</Text>
              <Text style={styles.idName}>👤 {auth.account?.username}</Text>
            </View>
            <Text style={styles.idAction}>Профайл ›</Text>
          </Pressable>
        ) : (
          <View style={styles.idCard}>
            <View style={styles.idLeft}>
              <Text style={styles.idLabel}>Зочноор тоглож байна</Text>
              <Text style={styles.idName}>🧑 {name}</Text>
            </View>
            <Button
              title="Нэвтрэх"
              variant="secondary"
              onPress={() => openAuth('login')}
              style={styles.idBtn}
            />
          </View>
        )}

        <InviteList invites={invites} onAccept={onAcceptInvite} onDecline={onDeclineInvite} />

        {invited && (
          <View style={styles.invite}>
            <Text style={styles.inviteText}>
              Танийг <Text style={styles.inviteCode}>{initialCode}</Text> өрөөнд урьжээ
            </Text>
            <Text style={styles.inviteHint}>Доороос нэгдээрэй</Text>
          </View>
        )}

        <View style={styles.panel}>
          {/* Зочин нэрээ солиж болно. Нэвтэрсэн бол нэр нь бүртгэлийнх — тогтмол. */}
          {!loggedIn && (
            <>
              <Text style={styles.label}>Таны нэр</Text>
              <TextInput
                value={name}
                onChangeText={onNameChange}
                placeholder="Нэрээ бичнэ үү"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
                maxLength={16}
                autoCapitalize="words"
                returnKeyType={invited ? 'go' : 'done'}
                onSubmitEditing={() => invited && ready && onJoin(code)}
              />
            </>
          )}

          <Button
            title="Шинэ өрөө үүсгэх"
            variant={invited ? 'secondary' : 'primary'}
            onPress={onCreate}
            disabled={!ready}
            loading={connecting && !invited}
            style={styles.spaced}
          />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>эсвэл</Text>
            <View style={styles.line} />
          </View>

          <Text style={styles.label}>Өрөөний код</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ЖИШЭЭ: K7M2QD"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.codeInput]}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => ready && code.length === 6 && onJoin(code)}
          />
          <Button
            title="Өрөөнд нэгдэх"
            variant={invited ? 'primary' : 'secondary'}
            onPress={() => onJoin(code)}
            disabled={!ready || code.trim().length !== 6}
            loading={connecting && invited}
            style={styles.spaced}
          />
        </View>

        {serverSettings}
      </ScrollView>
      {authPanel}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: 20,
    paddingBottom: 48,
    gap: 12,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  hero: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  title: { color: theme.text, fontSize: 44, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: theme.textMuted, fontSize: 15 },
  panel: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    gap: 8,
  },
  gateTitle: { color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  gateSub: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 6 },
  gateHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  label: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    color: theme.text,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 4, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  spaced: { marginTop: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  line: { flex: 1, height: 1, backgroundColor: theme.surfaceRaised },
  dividerText: { color: theme.textMuted, fontSize: 12 },
  hint: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
  // Хэн болохыг харуулах самбар.
  idCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  idLeft: { flex: 1, gap: 2 },
  idLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  idLabelIn: { color: theme.success },
  idName: { color: theme.text, fontSize: 18, fontWeight: '800' },
  idAction: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  idBtn: { paddingHorizontal: 16, minHeight: 40 },
  invite: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 14,
    gap: 4,
  },
  inviteText: { color: theme.text, fontSize: 15 },
  inviteCode: { color: theme.accent, fontWeight: '800', letterSpacing: 2 },
  inviteHint: { color: theme.textMuted, fontSize: 13 },
});
