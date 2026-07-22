/**
 * "Та зочноор тоглож байна" анхааруулга.
 *
 * Зочны тоглолт огт тооцогддоггүй: токен нэмэгдэхгүй, цол ахихгүй, түүхэнд
 * үлдэхгүй. Тоглогч үүнийг мэдэлгүй хэдэн долоо хоног тоглосны эцэст бүх
 * ахицаа алдсан тохиолдол гарсан тул тоглолт эхлэхийн ӨМНӨ тод хэлнэ.
 *
 * Өрөөнд сууж байхдаа нэвтэрсэн ч суудал нь холбогддог тул хожуу ч гэсэн
 * засах боломжтой.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

interface Props {
  /** Нэвтрэх цонх нээх товч — HomeScreen дэх AuthPanel-ыг дамжуулна. */
  action?: React.ReactNode;
  /** Богино хувилбар — зай багатай газарт. */
  compact?: boolean;
}

export function GuestNotice({ action, compact = false }: Props) {
  return (
    <View style={[styles.box, compact && styles.boxCompact]}>
      <View style={styles.text}>
        <Text style={styles.title}>Та зочноор тоглож байна</Text>
        {!compact && (
          <Text style={styles.body}>
            Токен нэмэгдэхгүй, цол ахихгүй, тоглолт түүхэнд үлдэхгүй. Нэвтэрвэл
            энэ тоглолтоос эхлэн тооцогдоно.
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(242,183,5,0.12)',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    padding: 12,
  },
  boxCompact: { padding: 8, borderRadius: 8 },
  text: { flex: 1, gap: 3 },
  title: { color: theme.accent, fontSize: 14, fontWeight: '800' },
  body: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
});
