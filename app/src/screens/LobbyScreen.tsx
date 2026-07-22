import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdSlot } from '../components/AdSlot';
import { AuthPanel } from '../components/AuthPanel';
import { Button } from '../components/Button';
import { GuestNotice } from '../components/GuestNotice';
import { joinUrl } from '../deeplink';
import { formatChips, groupDigits, shortChips } from '../chips';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  SEATS_PER_ROUND,
  MAX_STAKE,
  MIN_STAKE,
  STAKE_CHOICES,
  TARGET_SCORE_CHOICES,
  TURN_SECONDS_CHOICES,
} from '../shared/game';
import { BOT_LEVELS, BOT_LEVEL_NAMES, type BotLevel } from '../shared/bot';
import type { AdView, GameView } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  view: GameView;
  onStart: (targetScore: number, turnSeconds: number, stake: number) => void;
  /** Нэвтрэлтийн самбар — зочин байвал лоббид ч гаргана. */
  auth: React.ComponentProps<typeof AuthPanel>;
  onAddBot: (level: BotLevel) => void;
  onRemoveBot: (playerId: string) => void;
  ads: AdView[];
  httpBase: string;
  onAdEvent: (id: string, kind: 'seen' | 'click') => void;
  onLeave: () => void;
}

const secondsLabel = (s: number): string => (s >= 60 ? `${s / 60} мин` : `${s} сек`);

export function LobbyScreen({
  view,
  onStart,
  onLeave,
  auth,
  onAddBot,
  onRemoveBot,
  ads,
  httpBase,
  onAdEvent,
}: Props) {
  const [target, setTarget] = useState<number>(TARGET_SCORE_CHOICES[0]);
  const [turnSeconds, setTurnSeconds] = useState<number>(TURN_SECONDS_CHOICES[0]);
  const [stake, setStake] = useState<number>(STAKE_CHOICES[0]);
  // Тоглогчид хоорондоо тохирч дурын дүн тавих боломж. Бэлэн сонголтод
  // байхгүй дүн сонгосон бол энэ горим асна.
  const [customOn, setCustomOn] = useState(false);
  const [customText, setCustomText] = useState('');
  const you = view.players.find((p) => p.id === view.youId);
  const isHost = you?.isHost ?? false;
  const enough = view.players.length >= MIN_PLAYERS;
  // Өөрөө оруулах горимд буруу тоо бичсэн эсэх — эхлүүлэх товчийг хаана.
  const customInvalid = customOn && stake === 0 && customText.length > 0;
  const rotating = view.players.length > SEATS_PER_ROUND;

  const link = joinUrl(view.code);
  const share = () => {
    void Share.share({
      message: link
        ? `Дай Ди тоглоом! Линк дарахад шууд орно:\n${link}`
        : `Дай Ди тоглоом! Өрөөний код: ${view.code}`,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Өрөөний код</Text>
      <Text style={styles.code} accessibilityLabel={view.code.split('').join(' ')}>
        {view.code}
      </Text>
      <Button title="Найзууддаа илгээх" variant="secondary" onPress={share} />
      {link && (
        <Text style={styles.link} numberOfLines={1}>
          {link}
        </Text>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>
          Тоглогчид ({view.players.length}/{MAX_PLAYERS})
        </Text>
        {view.players.map((p) => (
          <View key={p.id} style={styles.row}>
            <View
              style={[styles.dot, { backgroundColor: p.connected ? theme.success : theme.textMuted }]}
            />
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
              {p.id === view.youId ? ' (та)' : ''}
            </Text>
            {p.bot && <Text style={styles.botTag}>бот</Text>}
            {p.isHost && <Text style={styles.badge}>эзэн</Text>}
            {p.bot && isHost && (
              <Pressable
                onPress={() => onRemoveBot(p.id)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}-г хасах`}
              >
                <Text style={styles.removeBot}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}

        {isHost && view.players.length < MAX_PLAYERS && (
          <View style={styles.botAdd}>
            <Text style={styles.botAddLabel}>Бот нэмэх</Text>
            <View style={styles.botLevels}>
              {BOT_LEVELS.map((level) => (
                <Pressable
                  key={level}
                  onPress={() => onAddBot(level)}
                  accessibilityRole="button"
                  style={styles.botLevel}
                >
                  <Text style={styles.botLevelText}>{BOT_LEVEL_NAMES[level]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              Найз завгүй үед ботуудтай тоглож болно. Ботын тоглолт токен, цолд
              тооцогдохгүй.
            </Text>
          </View>
        )}
        {!enough && <Text style={styles.hint}>Дор хаяж нэг найзаа хүлээж байна…</Text>}
        {rotating && (
          <Text style={styles.hint}>
            Хөзөр 52 тул тойрог бүрд {SEATS_PER_ROUND} хүн тоглоно — үлдсэн нь ээлжлэн өнжинө.
          </Text>
        )}
      </View>

      {!auth.account && <GuestNotice action={<AuthPanel {...auth} />} />}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Хэдэн оноонд хүрвэл хасагдах вэ?</Text>
        <View style={styles.choices}>
          {TARGET_SCORE_CHOICES.map((choice) => {
            const active = target === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => setTarget(choice)}
                disabled={!isHost}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.choice, active && styles.choiceActive, !isHost && styles.choiceLocked]}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{choice}</Text>
                <Text style={styles.choiceLabel}>оноо</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {isHost
            ? 'Босгод хүрсэн тоглогч хасагдаж, бусад нь үргэлжлүүлнэ. Сүүлд үлдсэн нь хожино.'
            : `Өрөөний эзэн ${target} оноо сонгосон байна.`}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Нэг ээлжинд бодох хугацаа</Text>
        <View style={styles.choices}>
          {TURN_SECONDS_CHOICES.map((choice) => {
            const active = turnSeconds === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => setTurnSeconds(choice)}
                disabled={!isHost}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.choice, active && styles.choiceActive, !isHost && styles.choiceLocked]}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                  {choice >= 60 ? choice / 60 : choice}
                </Text>
                <Text style={styles.choiceLabel}>{choice >= 60 ? 'минут' : 'секунд'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Хугацаа дуусахад автоматаар пас болно. Шинэ эргэлт эхлүүлэх ээлж байсан бол
          хамгийн сул хөзөр тавигдана.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Чип (нэг тоглогч)</Text>
        <View style={styles.stakeChoices}>
          {STAKE_CHOICES.map((choice) => {
            const active = stake === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => {
                  setStake(choice);
                  setCustomOn(false);
                }}
                disabled={!isHost}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.stakeChoice,
                  active && styles.choiceActive,
                  !isHost && styles.choiceLocked,
                ]}
              >
                <Text style={[styles.stakeText, active && styles.choiceTextActive]}>
                  {shortChips(choice)}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => {
              setCustomOn(true);
              setCustomText('');
            }}
            disabled={!isHost}
            accessibilityRole="radio"
            accessibilityState={{ selected: customOn }}
            style={[
              styles.stakeChoice,
              customOn && styles.choiceActive,
              !isHost && styles.choiceLocked,
            ]}
          >
            <Text style={[styles.stakeText, customOn && styles.choiceTextActive]}>Өөр дүн</Text>
          </Pressable>
        </View>

        {customOn && (
          <View style={styles.customRow}>
            <TextInput
              value={customText}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, '').slice(0, 7);
                setCustomText(digits);
                const value = Number(digits);
                // Хязгаарт багтсан үед л хүчинтэй болгоно; эс бөгөөс 0 болгож
                // эхлүүлэх товчийг хаана.
                setStake(value >= MIN_STAKE && value <= MAX_STAKE ? value : 0);
              }}
              editable={isHost}
              placeholder={`${groupDigits(MIN_STAKE)}–${groupDigits(MAX_STAKE)}`}
              placeholderTextColor={theme.textMuted}
              style={[styles.customInput, !isHost && styles.choiceLocked]}
              keyboardType="number-pad"
              inputMode="numeric"
            />
            <Text style={styles.customUnit}>токен</Text>
          </View>
        )}
        <Text style={[styles.hint, customInvalid && styles.warn]}>
          {customInvalid
            ? `${groupDigits(MIN_STAKE)}-аас ${groupDigits(MAX_STAKE)} хооронд тоо оруулна уу.`
            : stake === 0
              ? 'Чипгүй тоглоно.'
              : `Хожигч бусад тоглогч бүрээс ${formatChips(stake)} авна. Тоглолт дуусахад хэн хэдийг хожсон, алдсаныг харуулна.`}
        </Text>
        {stake > 0 && (
          <Text style={styles.note}>
            Чип нь виртуал — бодит мөнгө биш.
          </Text>
        )}
      </View>

      {ads.length > 0 && (
        <AdSlot ads={ads} httpBase={httpBase} onEvent={onAdEvent} height={96} />
      )}

      <View style={styles.actions}>
        {isHost ? (
          <Button
            title={`Эхлүүлэх · ${target} оноо · ${secondsLabel(turnSeconds)}${
              stake ? ` · ${shortChips(stake)}` : ''
            }`}
            onPress={() => onStart(target, turnSeconds, stake)}
            disabled={!enough || (customOn && stake === 0)}
          />
        ) : (
          <Text style={styles.hint}>Өрөөний эзэн эхлүүлэхийг хүлээж байна…</Text>
        )}
        <Button title="Өрөөнөөс гарах" variant="ghost" onPress={onLeave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  eyebrow: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  code: {
    color: theme.accent,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 6,
  },
  link: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
  panel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, gap: 10 },
  panelTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: theme.text, fontSize: 16, flex: 1 },
  badge: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  choices: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.surfaceRaised,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
  },
  choiceActive: { borderColor: theme.accent },
  choiceLocked: { opacity: 0.6 },
  choiceText: { color: theme.textMuted, fontSize: 24, fontWeight: '800' },
  choiceTextActive: { color: theme.accent },
  choiceLabel: { color: theme.textMuted, fontSize: 11 },
  botTag: {
    color: theme.textMuted,
    fontSize: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  removeBot: { color: theme.textMuted, fontSize: 14, paddingHorizontal: 4 },
  botAdd: { gap: 8, marginTop: 10 },
  botAddLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  botLevels: { flexDirection: 'row', gap: 8 },
  botLevel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  botLevelText: { color: theme.text, fontSize: 13, fontWeight: '700' },

  stakeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stakeChoice: {
    flexGrow: 1,
    minWidth: 84,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.surfaceRaised,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customInput: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.accent,
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customUnit: { color: theme.textMuted, fontSize: 14 },
  warn: { color: theme.danger },
  stakeText: { color: theme.textMuted, fontSize: 15, fontWeight: '700' },
  note: { color: theme.textMuted, fontSize: 11, fontStyle: 'italic' },
  actions: { gap: 8, marginTop: 4 },
});
