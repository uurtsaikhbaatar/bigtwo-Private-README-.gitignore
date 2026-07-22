import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ChatLine } from '../net';
import { Overlay } from './Overlay';
import { theme } from '../theme';
import { Recording, playVoice, startRecording, voiceSupported } from '../voice';

/** Хурдан сонгох emoji-нууд — тоглоомд тохирсон. */
const EMOJI = [
  '😀', '😂', '😅', '😎', '🤔', '😱', '😭', '🥳',
  '👍', '👎', '👏', '🙏', '🔥', '💪', '🎉', '💀',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🐉', '⏰', '🍀',
];

interface Props {
  lines: ChatLine[];
  youName: string;
  onSend: (text: string) => void;
  onSendVoice: (data: string, ms: number) => void;
}

/**
 * Чат — товч дарахад нээгддэг цонх. Бичвэр, emoji, дуут мессеж дэмжинэ.
 * Уншаагүй мессежийн тоог товчин дээр харуулна.
 */
export function ChatButton({ lines, youName, onSend, onSendVoice }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const unread = Math.max(0, lines.length - seen);
  const canRecord = voiceSupported();

  useEffect(() => {
    if (open) setSeen(lines.length);
  }, [open, lines.length]);

  // Бичиж байх хугацааг тоолно.
  useEffect(() => {
    if (!recording) {
      setRecordSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setRecordSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  const toggleRecording = async () => {
    setVoiceError(null);
    if (recording) {
      const active = recording;
      setRecording(null);
      try {
        const clip = await active.stop();
        if (clip.ms > 400) onSendVoice(clip.data, clip.ms);
      } catch {
        setVoiceError('Бичлэгийг илгээж чадсангүй.');
      }
      return;
    }
    try {
      setRecording(await startRecording());
    } catch {
      setVoiceError('Микрофон ашиглах зөвшөөрөл өгнө үү.');
    }
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

      <Overlay visible={open} onClose={() => setOpen(false)}>
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
                    {line.audio ? (
                      <Pressable
                        onPress={() => playVoice(line.audio!)}
                        accessibilityRole="button"
                        accessibilityLabel="Дуут мессеж тоглуулах"
                        style={styles.voiceRow}
                      >
                        <Text style={styles.voiceIcon}>▶︎</Text>
                        <View style={styles.waveform}>
                          {Array.from({ length: 14 }).map((_, bar) => (
                            <View
                              key={bar}
                              style={[styles.wave, { height: 4 + ((bar * 7) % 13) }]}
                            />
                          ))}
                        </View>
                        <Text style={styles.voiceLength}>
                          {Math.max(1, Math.round((line.ms ?? 0) / 1000))}с
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.message}>{line.text}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {showEmoji && (
              <View style={styles.emojiTray}>
                {EMOJI.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => setText((prev) => prev + e)}
                    accessibilityRole="button"
                    accessibilityLabel={`Emoji ${e}`}
                    style={styles.emojiButton}
                  >
                    <Text style={styles.emoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {voiceError && <Text style={styles.voiceError}>{voiceError}</Text>}

            <View style={styles.composer}>
              <Pressable
                onPress={() => setShowEmoji((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Emoji"
                style={[styles.iconButton, showEmoji && styles.iconButtonActive]}
              >
                <Text style={styles.iconText}>😊</Text>
              </Pressable>

              {recording ? (
                <View style={styles.recordingBar}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Бичиж байна… {recordSeconds}с</Text>
                </View>
              ) : (
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
              )}

              {canRecord && (
                <Pressable
                  onPress={toggleRecording}
                  accessibilityRole="button"
                  accessibilityLabel={recording ? 'Бичлэг зогсоох' : 'Дуут мессеж бичих'}
                  style={[styles.iconButton, recording && styles.iconButtonRecording]}
                >
                  <Text style={styles.iconText}>{recording ? '⏹' : '🎤'}</Text>
                </Pressable>
              )}

              {!recording && (
                <Pressable
                  onPress={submit}
                  disabled={!text.trim()}
                  accessibilityRole="button"
                  style={[styles.sendButton, !text.trim() && styles.sendDisabled]}
                >
                  <Text style={styles.sendText}>Илгээх</Text>
                </Pressable>
              )}
            </View>
          </View>
      </Overlay>
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

  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
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

  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150 },
  voiceIcon: { color: theme.text, fontSize: 16 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  wave: { width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  voiceLength: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  voiceError: { color: theme.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 4 },

  emojiTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 2,
  },
  emojiButton: { padding: 6 },
  emoji: { fontSize: 22 },

  composer: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 8 },
  iconButton: {
    width: 44,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: { backgroundColor: '#1d7a52' },
  iconButtonRecording: { backgroundColor: theme.danger },
  iconText: { fontSize: 20 },
  input: {
    flex: 1,
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    color: theme.text,
    fontSize: 15,
  },
  recordingBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: theme.surfaceRaised,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger },
  recordingText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  sendButton: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1d7a52',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: theme.text, fontWeight: '700' },
});
