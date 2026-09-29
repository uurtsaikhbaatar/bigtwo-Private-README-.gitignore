/**
 * Чип илгээх маягт.
 *
 * Профайлаас (нэрээр) болон тоглогчийн мэдээллийн цонхноос (тухайн хүн рүү)
 * хоёуланд нь ашиглана. Шимтгэлийг урьдчилан харуулна — жинхэнэ тооцоо,
 * үлдэгдэл/хязгаарын шалгалтыг сервер хийнэ.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { groupDigits } from '../chips';
import { DAILY_TRANSFER_LIMIT, MIN_TRANSFER, transferFee } from '../shared/transfer';
import { theme } from '../theme';
import { Button } from './Button';

interface Props {
  /** Хүлээн авагч тогтмол бол (өрөөн доторх тоглогч) нэрийн талбар гарахгүй. */
  recipient?: string;
  onSend: (amount: number, username: string) => void;
}

export function TransferForm({ recipient, onSend }: Props) {
  const [username, setUsername] = useState('');
  const [amountText, setAmountText] = useState('');

  const amount = Number(amountText) || 0;
  const fee = amount > 0 ? transferFee(amount) : 0;
  const to = recipient ?? username.trim();
  const valid = Boolean(to) && amount >= MIN_TRANSFER;

  const submit = () => {
    if (!valid) return;
    onSend(amount, to);
    setAmountText('');
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {recipient ? `${recipient} руу чип илгээх` : 'Чип илгээх'}
      </Text>
      {!recipient && (
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Хүлээн авагчийн нэр"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
          maxLength={16}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <TextInput
        value={amountText}
        onChangeText={(t) => setAmountText(t.replace(/\D/g, '').slice(0, 9))}
        placeholder="Хэмжээ"
        placeholderTextColor={theme.textMuted}
        style={styles.input}
        keyboardType="number-pad"
        onSubmitEditing={submit}
      />
      {amount > 0 && (
        <Text style={styles.hint}>
          Хүлээн авагчид {groupDigits(Math.max(0, amount - fee))} очно · шимтгэл 5% (
          {groupDigits(fee)})
        </Text>
      )}
      <Button title="Илгээх" variant="secondary" onPress={submit} disabled={!valid} />
      <Text style={styles.note}>
        Өдөрт {groupDigits(DAILY_TRANSFER_LIMIT)} хүртэл. Буцаах боломжгүй — нэрээ сайн шалгаарай.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  title: { color: theme.text, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    color: theme.text,
    fontSize: 16,
  },
  hint: { color: theme.textMuted, fontSize: 12 },
  note: { color: theme.textMuted, fontSize: 10, fontStyle: 'italic' },
});
