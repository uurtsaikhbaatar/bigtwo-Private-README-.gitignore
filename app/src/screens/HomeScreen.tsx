import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthPanel } from '../components/AuthPanel';
import { Button } from '../components/Button';
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
}

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
}: Props) {
  const [code, setCode] = useState(initialCode);
  const [showSettings, setShowSettings] = useState(false);
  const ready = name.trim().length > 0;
  const invited = initialCode.length === 6;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.title}>Дай Ди</Text>
          <Text style={styles.subtitle}>Найзуудтайгаа хятад покер тоглох</Text>
          <AuthPanel {...auth} />
        </View>

        {invited && (
          <View style={styles.invite}>
            <Text style={styles.inviteText}>
              Танийг <Text style={styles.inviteCode}>{initialCode}</Text> өрөөнд урьжээ
            </Text>
            <Text style={styles.inviteHint}>Нэрээ бичээд нэгдээрэй</Text>
          </View>
        )}

        <View style={styles.panel}>
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
      </ScrollView>
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
