import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MAX_REPORT_CHARS } from '../shared/protocol';
import { Overlay } from './Overlay';
import { theme } from '../theme';

interface Props {
  onSend: (text: string) => void;
  /** Сервер хүлээж авсны дараах дугаар. */
  lastReportId: string | null;
}

/**
 * Алдаа мэдэгдэх товч. Тоглогч юу болсныг бичихэд апп нь тухайн үеийн
 * төлөв, төхөөрөмжийн мэдээллийг автоматаар хавсаргана.
 */
export function ReportButton({ onSend, lastReportId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
    setSentId('pending');
  };

  const close = () => {
    setOpen(false);
    setSentId(null);
  };

  const confirmed = sentId !== null ? (lastReportId ?? null) : null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Алдаа мэдэгдэх"
        style={styles.fab}
      >
        <Text style={styles.fabIcon}>🐞</Text>
      </Pressable>

      <Overlay visible={open} onClose={close}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Алдаа мэдэгдэх</Text>
              <Pressable onPress={close} accessibilityRole="button">
                <Text style={styles.close}>Хаах</Text>
              </Pressable>
            </View>

            {confirmed ? (
              <View style={styles.done}>
                <Text style={styles.doneIcon}>✓</Text>
                <Text style={styles.doneText}>Баярлалаа! Мэдэгдэл хүлээн авлаа.</Text>
                <Text style={styles.doneId}>Дугаар: {confirmed}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.hint}>
                  Юу болсныг бичнэ үү. Тоглоомын одоогийн төлөв, төхөөрөмжийн мэдээлэл
                  автоматаар хавсаргагдана.
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Жишээ: хөзөр тавихад товч ажиллахгүй байна…"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  maxLength={MAX_REPORT_CHARS}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Pressable
                  onPress={submit}
                  disabled={!text.trim()}
                  accessibilityRole="button"
                  style={[styles.sendButton, !text.trim() && styles.sendDisabled]}
                >
                  <Text style={styles.sendText}>Илгээх</Text>
                </Pressable>
              </>
            )}
          </View>
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fabIcon: { fontSize: 18 },

  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 15 },
  hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    color: theme.text,
    fontSize: 15,
  },
  sendButton: {
    minHeight: 48,
    borderRadius: theme.radius,
    backgroundColor: '#1d7a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  done: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  doneIcon: { color: theme.success, fontSize: 34, fontWeight: '800' },
  doneText: { color: theme.text, fontSize: 15 },
  doneId: { color: theme.textMuted, fontSize: 12 },
});
