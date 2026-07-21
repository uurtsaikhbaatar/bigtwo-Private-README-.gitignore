import React, { useEffect, useRef, useState } from 'react';
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

import type { ChatLine } from '../net';
import { theme } from '../theme';

interface Props {
  lines: ChatLine[];
  youName: string;
  onSend: (text: string) => void;
}

/**
 * Чат — товч дарахад нээгддэг цонх. Уншаагүй мессежийн тоог товчин дээр
 * харуулна.
 */
export function ChatButton({ lines, youName, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const unread = Math.max(0, lines.length - seen);

  useEffect(() => {
    if (open) setSeen(lines.length);
  }, [open, lines.length]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Чат"
        style={styles.fab}
      >
        <Text style={styles.fabIcon}>💬</Text>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdropFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Чат</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                <Text style={styles.close}>Хаах</Text>
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {lines.length === 0 && <Text style={styles.empty}>Хараахан мессеж алга.</Text>}
              {lines.map((line, i) => {
                const mine = line.from === youName;
                return (
                  <View key={`${line.at}-${i}`} style={[styles.bubble, mine && styles.bubbleMine]}>
                    {!mine && <Text style={styles.from}>{line.from}</Text>}
                    <Text style={styles.message}>{line.text}</Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.composer}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Мессеж бичих…"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
                maxLength={200}
                returnKeyType="send"
                onSubmitEditing={submit}
                blurOnSubmit={false}
              />
              <Pressable
                onPress={submit}
                disabled={!text.trim()}
                accessibilityRole="button"
                style={[styles.sendButton, !text.trim() && styles.sendDisabled]}
              >
                <Text style={styles.sendText}>Илгээх</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fabIcon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: theme.text, fontSize: 11, fontWeight: '800' },

  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 15 },
  list: { paddingHorizontal: 12 },
  listContent: { gap: 6, paddingBottom: 8 },
  empty: { color: theme.textMuted, textAlign: 'center', paddingVertical: 24 },
  bubble: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 12,
    padding: 10,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#1d7a52' },
  from: { color: theme.accent, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  message: { color: theme.text, fontSize: 15 },
  composer: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    color: theme.text,
    fontSize: 15,
  },
  sendButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1d7a52',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: theme.text, fontWeight: '700' },
});
