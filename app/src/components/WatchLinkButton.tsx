/**
 * Үзэгчийн линк хуваалцах товч.
 *
 * Тоглож байгаа тоглогч нарын ХЭН Ч найздаа `?watch=КОД` линк илгээж болно.
 * Дарахад линкийг клипбордод хуулж, богино зуур "хууллаа" гэж мэдэгдэнэ.
 * Native дээр (window байхгүй) линк үүсэхгүй тул товч харагдахгүй.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { watchUrl } from '../deeplink';
import { theme } from '../theme';

export function WatchLinkButton({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const url = watchUrl(code);
  if (!url) return null; // зөвхөн вэб дээр

  const share = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Клипборд боломжгүй бол чимээгүй өнгөрнө.
    }
  };

  return (
    <Pressable
      onPress={share}
      accessibilityRole="button"
      accessibilityLabel="Үзэгчийн линк хуваалцах"
      style={[styles.btn, compact && styles.btnCompact]}
    >
      <Text style={[styles.txt, compact && styles.txtCompact]}>
        {copied ? (compact ? '✓ Хууллаа' : '✓ Линк хууллаа') : compact ? '👁 Үзэгч' : '👁 Үзэгчийн линк хуваалцах'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  txt: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  btnCompact: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8 },
  txtCompact: { fontSize: 12 },
});
