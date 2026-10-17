/**
 * Texas Hold'em ширээ — лобби, тоглолт, үр дүн нэг дэлгэцэнд.
 *
 * Нэр томьёо англиар (хэрэглэгчийн шийдвэр): Fold, Check, Call, Bet, Raise,
 * All-in, Pot, Blind, Buy-in г.м. Тайлбар нь монголоор.
 *
 * Ширээ нь зуйван: 9 суудлыг эллипс дээр байрлуулж, ТАНЫ суудал үргэлж доор.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CardBack, PlayingCard } from '../components/PlayingCard';
import { RankBadge } from '../components/RankBadge';
import { TurnTimer, useTurnCountdown } from '../components/TurnTimer';
import { WatchLinkButton } from '../components/WatchLinkButton';
import { formatSignedChips, groupDigits, shortChips } from '../chips';
import { joinUrl } from '../deeplink';
import { BOT_LEVELS, BOT_LEVEL_NAMES, type BotLevel } from '../shared/bot';
import type { PokerActionKind } from '../shared/holdem/engine';
import {
  CASH_BLIND_CHOICES,
  POKER_MAX_SEATS,
  POKER_TURN_SECONDS_CHOICES,
  SNG_BUYIN_CHOICES,
  SNG_HANDS_PER_LEVEL,
  SNG_STARTING_CHIPS,
  payouts,
} from '../shared/holdem/structure';
import type { PokerPlayerView, PokerView } from '../shared/holdem/view';
import type { Account } from '../shared/protocol';
import { theme } from '../theme';

interface Props {
  view: PokerView;
  account: Account | null;
  onAct: (kind: PokerActionKind, amount?: number) => void;
  onStart: (buyIn: number, turnSeconds: number) => void;
  onBlinds: (sb: number, bb: number) => void;
  onBuyIn: (amount: number) => void;
  onSitIn: () => void;
  onAddBot: (level: BotLevel) => void;
  onRemoveBot: (playerId: string) => void;
  onLeave: () => void;
  onInvite: () => void;
  onInspect: (playerId: string, name: string) => void;
}

const n = groupDigits;

export function PokerScreen(props: Props) {
  const { view } = props;
  const started = view.handNo > 0;
  const showLobby = !started || view.phase === 'finished';
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Header {...props} />
      {view.spectating && (
        <View style={styles.spectator}>
          <Text style={styles.spectatorText}>👁 Үзэгчээр харж байна</Text>
          <Pressable onPress={props.onLeave} accessibilityRole="button">
            <Text style={styles.spectatorLeave}>Үзэхээ болих</Text>
          </Pressable>
        </View>
      )}
      {started && <Table {...props} />}
      {started && !view.spectating && view.phase !== 'finished' && <YouPanel {...props} />}
      {view.phase === 'finished' && <Results view={view} />}
      {showLobby && !view.spectating && <Lobby {...props} />}
      {started && view.phase !== 'finished' && <HandLog view={view} />}
    </ScrollView>
  );
}

// ── Толгой ──────────────────────────────────────────────────────────────────

function Header({ view, onLeave, onInvite }: Props) {
  const fmt = view.format === 'sng' ? 'Sit & Go' : 'Cash game';
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>♠ Texas Hold'em · {fmt}</Text>
        <Text style={styles.sub}>
          Өрөө <Text style={styles.code}>{view.code}</Text>
          {view.handNo > 0 && (
            <>
              {'  ·  '}Hand #{view.handNo}
              {'  ·  '}Blinds {n(view.sb)}/{n(view.bb)}
              {view.bbAnte > 0 ? ` · BB Ante ${n(view.bbAnte)}` : ''}
            </>
          )}
        </Text>
        {view.format === 'sng' && view.handNo > 0 && view.phase !== 'finished' && view.nextLevel && (
          <Text style={styles.subSmall}>
            Дараагийн Blind level {view.handsToNextLevel} гарын дараа: {n(view.nextLevel.sb)}/
            {n(view.nextLevel.bb)}
            {view.nextLevel.bbAnte ? ` · Ante ${n(view.nextLevel.bbAnte)}` : ''}
          </Text>
        )}
      </View>
      <View style={styles.headerButtons}>
        {view.handNo > 0 && !view.spectating && <WatchLinkButton code={view.code} />}
        {!view.spectating && (
          <Pressable onPress={onInvite} style={styles.smallBtn} accessibilityRole="button">
            <Text style={styles.smallBtnText}>Урих</Text>
          </Pressable>
        )}
        {!view.spectating && (
          <Pressable onPress={onLeave} style={[styles.smallBtn, styles.leaveBtn]} accessibilityRole="button">
            <Text style={styles.smallBtnText}>Гарах</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Ширээ ───────────────────────────────────────────────────────────────────

function Table({ view, onInspect }: Props) {
  const [size, setSize] = useState({ w: 360, h: 380 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };
  const me = view.players.find((p) => p.id === view.youId);
  const anchor = me?.seat ?? 0;
  const secondsLeft = useTurnCountdown(view.turnRemainingMs, view.turnSeq);

  // Эллипс дээрх байрлал: k=0 доод төв (та), цагийн зүүний дагуу.
  const pos = (seat: number, inset = 0) => {
    const k = (seat - anchor + POKER_MAX_SEATS) % POKER_MAX_SEATS;
    const a = Math.PI / 2 + (k * 2 * Math.PI) / POKER_MAX_SEATS;
    const rx = size.w / 2 - 44 - inset * (size.w / 2 - 44);
    // Доод суудлын хөзөр, цаг бүрэн харагдахаар зай үлдээнэ.
    const ry = size.h / 2 - 58 - inset * (size.h / 2 - 58);
    return { x: size.w / 2 + rx * Math.cos(a), y: size.h / 2 + ry * Math.sin(a) };
  };

  const winners = new Set(view.pots.flatMap((p) => p.winners));
  const showResult = view.phase === 'handEnd' || view.phase === 'finished';

  return (
    <View style={styles.tableWrap} onLayout={onLayout}>
      <View style={styles.felt} />
      {/* Төв: ширээний хөзөр ба Pot */}
      <View style={[styles.center, { left: size.w / 2 - 120, top: size.h / 2 - 52 }]}>
        <View style={styles.board}>
          {Array.from({ length: 5 }, (_, i) =>
            view.board[i] !== undefined ? (
              <PlayingCard key={i} card={view.board[i]} size="sm" />
            ) : (
              <View key={i} style={styles.boardSlot} />
            ),
          )}
        </View>
        <Text style={styles.pot}>
          {showResult ? 'Pot' : 'Pot'} {n(view.pot)}
        </Text>
        {showResult && view.pots.length > 0 && (
          <View style={styles.potResults}>
            {view.pots.map((pot, i) => (
              <Text key={i} style={styles.potLine} numberOfLines={2}>
                {pot.name} {n(pot.amount)} →{' '}
                {pot.winners.map((id) => view.players.find((p) => p.id === id)?.name ?? '?').join(', ')}
                {pot.hand ? ` · ${pot.hand}` : ''}
              </Text>
            ))}
          </View>
        )}
      </View>

      {view.players.map((p) => {
        const at = pos(p.seat);
        const chipAt = pos(p.seat, 0.42);
        const acting = view.toAct === p.id;
        return (
          <React.Fragment key={p.id}>
            {p.bet > 0 && (
              <View style={[styles.betChip, { left: chipAt.x - 30, top: chipAt.y - 10 }]}>
                <Text style={styles.betText}>{n(p.bet)}</Text>
              </View>
            )}
            <Seat
              p={p}
              you={p.id === view.youId}
              acting={acting}
              winner={showResult && winners.has(p.id)}
              secondsLeft={acting ? secondsLeft : null}
              style={{ left: at.x - 42, top: at.y - 30 }}
              onPress={() => onInspect(p.id, p.name)}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}

function Seat({
  p,
  you,
  acting,
  winner,
  secondsLeft,
  style,
  onPress,
}: {
  p: PokerPlayerView;
  you: boolean;
  acting: boolean;
  winner: boolean;
  secondsLeft: number | null;
  style: object;
  onPress: () => void;
}) {
  const out = p.eliminated || (!p.dealt && p.stack === 0);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.seat,
        style,
        acting && styles.seatActing,
        winner && styles.seatWinner,
        (p.folded || out) && styles.seatDim,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.seatCards}>
        {p.hole ? (
          p.hole.map((c) => <PlayingCard key={c} card={c} size="sm" />)
        ) : p.hasCards ? (
          <>
            <CardBack size="sm" />
            <CardBack size="sm" />
          </>
        ) : null}
      </View>
      <View style={styles.seatInfo}>
        {/* Big Two-гийн өрсөлдөгчийн толгойтой ижил: цэг, зураг, нэр, цол. */}
        <View style={styles.seatNameRow}>
          <View style={[styles.seatDot, { backgroundColor: p.connected ? theme.success : theme.danger }]} />
          <Avatar name={p.name} avatar={p.avatar} size={16} />
          <Text style={[styles.seatName, you && styles.seatNameYou]} numberOfLines={1}>
            {p.name}
          </Text>
        </View>
        {p.rankedWins !== null && (
          <View style={styles.seatRank}>
            <RankBadge wins={p.rankedWins} />
          </View>
        )}
        <Text style={styles.seatStack}>
          {p.eliminated ? `#${p.place}` : n(p.stack)}
          {p.allIn ? ' · All-in' : ''}
        </Text>
        {p.lastAction && !p.eliminated && (
          <Text style={styles.seatAction} numberOfLines={1}>
            {p.lastAction}
          </Text>
        )}
        {p.handLabel && p.hole && (
          <Text style={styles.seatHand} numberOfLines={1}>
            {p.handLabel}
          </Text>
        )}
        {(p.sittingOut || p.waitBB || !p.connected) && !p.eliminated && (
          <Text style={styles.seatAway} numberOfLines={1}>
            {!p.connected ? 'тасарсан' : p.waitBB ? 'BB хүлээж байна' : 'Sit out'}
          </Text>
        )}
      </View>
      <View style={styles.badges}>
        {p.isButton && <Text style={[styles.badge, styles.badgeD]}>D</Text>}
        {p.isSB && <Text style={styles.badge}>SB</Text>}
        {p.isBB && <Text style={styles.badge}>BB</Text>}
      </View>
      {secondsLeft !== null && (
        <View style={styles.seatTimer}>
          <TurnTimer secondsLeft={secondsLeft} yours={you} compact />
        </View>
      )}
    </Pressable>
  );
}

// ── Танд ────────────────────────────────────────────────────────────────────

function YouPanel(props: Props) {
  const { view, onSitIn } = props;
  // Утсанд баруун талын хөвөгч товчнууд (дуу, тусламж, чат) үйлдлийн товчийг
  // давхарлахгүйн тулд зай авна.
  const { width } = useWindowDimensions();
  const fabGap = width < 760 ? styles.fabGap : null;
  const me = view.players.find((p) => p.id === view.youId);
  if (!me) return null;
  const legal = view.legal;
  return (
    <View style={[styles.youPanel, fabGap]}>
      <Pressable
        onPress={() => props.onInspect(me.id, me.name)}
        accessibilityRole="button"
        accessibilityLabel="Миний мэдээлэл"
        style={styles.meRow}
      >
        <Avatar name={me.name} avatar={me.avatar} size={22} />
        <Text style={styles.meName} numberOfLines={1}>
          {me.name}
        </Text>
        {me.rankedWins === null ? (
          // Зочин — тоглолт нь тооцогдохгүй гэдгийг тоглох явцад ч сануулна.
          <Text style={styles.guestTag}>зочин</Text>
        ) : (
          <RankBadge wins={me.rankedWins} />
        )}
      </Pressable>
      <View style={styles.youRow}>
        <View style={styles.youCards}>
          {me.hole?.map((c) => <PlayingCard key={c} card={c} size="md" dimmed={me.folded} />)}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.youStack}>Stack {n(me.stack)}</Text>
          {view.yourHand && <Text style={styles.youHand}>{view.yourHand}</Text>}
          {me.folded && view.phase === 'playing' && <Text style={styles.muted}>Fold хийсэн</Text>}
          {me.eliminated && <Text style={styles.muted}>Хасагдсан — {me.place}-р байр</Text>}
        </View>
      </View>

      {legal ? (
        <ActionBar view={view} onAct={props.onAct} />
      ) : me.sittingOut && !me.eliminated && me.stack > 0 ? (
        <Button title="Буцаж суух (Sit in)" onPress={onSitIn} />
      ) : view.phase === 'playing' && view.toAct ? (
        <Text style={styles.waiting}>
          {view.players.find((p) => p.id === view.toAct)?.name} бодож байна…
        </Text>
      ) : null}

      {view.format === 'cash' && <CashSeatPanel {...props} />}
    </View>
  );
}

function ActionBar({ view, onAct }: { view: PokerView; onAct: Props['onAct'] }) {
  const legal = view.legal!;
  const [to, setTo] = useState(legal.minTo);
  // Шинэ ээлж бүрд доод хэмжээнээс эхэлнэ.
  useEffect(() => setTo(legal.minTo), [view.turnSeq, legal.minTo]);

  const potAfterCall = view.pot + legal.toCall;
  const clamp = (x: number) => Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(x)));
  const presets: Array<[string, number]> = [
    ['Min', legal.minTo],
    ['½ Pot', clamp(view.currentBet + potAfterCall / 2)],
    ['Pot', clamp(view.currentBet + potAfterCall)],
    ['All-in', legal.maxTo],
  ];
  const step = Math.max(1, view.bb);
  const callAll = legal.toCall > 0 && legal.toCall >= legal.maxTo - (view.players.find((p) => p.id === view.youId)?.bet ?? 0);

  return (
    <View style={{ gap: 8 }}>
      {legal.canRaise && (
        <View style={styles.raiseBox}>
          <View style={styles.presetRow}>
            {presets.map(([label, v]) => (
              <Pressable
                key={label}
                onPress={() => setTo(v)}
                style={[styles.preset, to === v && styles.presetOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.presetText, to === v && styles.presetTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.amountRow}>
            <Pressable onPress={() => setTo(clamp(to - step))} style={styles.stepBtn} accessibilityRole="button">
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <TextInput
              value={String(to)}
              onChangeText={(t) => {
                const v = Number(t.replace(/\D/g, ''));
                if (Number.isFinite(v)) setTo(v);
              }}
              onBlur={() => setTo(clamp(to))}
              keyboardType="number-pad"
              style={styles.amountInput}
            />
            <Pressable onPress={() => setTo(clamp(to + step))} style={styles.stepBtn} accessibilityRole="button">
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}
      <View style={styles.actionRow}>
        <Button title="Fold" variant="danger" onPress={() => onAct('fold')} style={styles.actionBtn} />
        {legal.canCheck ? (
          <Button title="Check" variant="secondary" onPress={() => onAct('check')} style={styles.actionBtn} />
        ) : (
          <Button
            title={`Call ${n(legal.toCall)}${callAll ? ' (All-in)' : ''}`}
            variant="secondary"
            onPress={() => onAct('call')}
            style={styles.actionBtn}
          />
        )}
        {legal.canRaise && (
          <Button
            title={
              clamp(to) >= legal.maxTo
                ? `All-in ${n(legal.maxTo)}`
                : `${view.currentBet === 0 ? 'Bet' : 'Raise to'} ${n(clamp(to))}`
            }
            onPress={() => {
              const v = clamp(to);
              if (v >= legal.maxTo) onAct('allin');
              else onAct(view.currentBet === 0 ? 'bet' : 'raise', v);
            }}
            style={styles.actionBtn}
          />
        )}
      </View>
    </View>
  );
}

// ── Cash: Buy-in ────────────────────────────────────────────────────────────

function CashSeatPanel({ view, account, onBuyIn }: Props) {
  const me = view.players.find((p) => p.id === view.youId);
  const [amount, setAmount] = useState(view.minBuyIn);
  useEffect(() => setAmount(view.minBuyIn), [view.minBuyIn]);
  if (!me) return null;
  const room = view.maxBuyIn - me.stack;
  const inHand = view.phase === 'playing' && me.dealt && !me.folded;
  if (room <= 0 || inHand) return null;
  const min = me.stack === 0 ? view.minBuyIn : Math.min(view.bb, room);
  const max = room;
  const clamp = (x: number) => Math.max(min, Math.min(max, Math.round(x)));
  return (
    <View style={styles.cashBox}>
      <Text style={styles.cashTitle}>{me.stack === 0 ? 'Buy-in хийж суух' : 'Чип нэмэх (Top up)'}</Text>
      {!account ? (
        <Text style={styles.muted}>Токеноор чип авахын тулд бүртгүүлж нэвтэрнэ үү.</Text>
      ) : (
        <>
          <Text style={styles.muted}>
            Таны токен: {n(account.tokens)} · Хязгаар {n(min)}–{n(max)} (Big Blind-ийн 40–100 дахин)
          </Text>
          <View style={styles.presetRow}>
            {[min, clamp((min + max) / 2), max].map((v, i) => (
              <Pressable
                key={i}
                onPress={() => setAmount(v)}
                style={[styles.preset, amount === v && styles.presetOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.presetText, amount === v && styles.presetTextOn]}>
                  {i === 0 ? 'Min' : i === 1 ? 'Дунд' : 'Max'} {shortChips(v)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            title={`Buy-in ${n(clamp(amount))}`}
            onPress={() => onBuyIn(clamp(amount))}
            disabled={account.tokens < clamp(amount)}
          />
        </>
      )}
    </View>
  );
}

// ── Лобби ───────────────────────────────────────────────────────────────────

function Lobby(props: Props) {
  const { view, onStart, onBlinds, onAddBot, onRemoveBot } = props;
  const me = view.players.find((p) => p.id === view.youId);
  const isHost = Boolean(me && view.players.find((p) => p.isHost)?.id === me.id);
  const [buyIn, setBuyIn] = useState<number>(view.buyIn || 0);
  const [secs, setSecs] = useState<number>(view.turnSeconds);
  const sng = view.format === 'sng';
  const entrants = view.players.filter((p) => !p.left).length;
  const prizes = sng && buyIn > 0 ? payouts(Math.max(2, entrants), buyIn) : [];
  const withChips = view.players.filter((p) => p.stack > 0).length;
  const canStart = sng ? view.players.length >= 2 : withChips >= 2;
  const firstTime = view.handNo === 0;

  // Big Two-гийн лоббитой адил: линкийг утасны хуваалцах цонхоор илгээнэ.
  // ("Урих" нь зөвхөн өмнө хамт тоглосон бүртгэлтэй хүмүүст апп доторх урилга.)
  const link = joinUrl(view.code);
  const share = () => {
    Share.share({
      message: link
        ? `Дай Ди — Texas Hold'em! Линк дарахад шууд орно:
${link}`
        : `Дай Ди — Texas Hold'em! Өрөөний код: ${view.code}`,
    }).catch(() => {
      // Хэрэглэгч цуцалсан — алдаа биш.
    });
  };

  return (
    <View style={styles.lobby}>
      <Text style={styles.codeEyebrow}>Өрөөний код</Text>
      <Text style={styles.codeBig} accessibilityLabel={view.code.split('').join(' ')}>
        {view.code}
      </Text>
      <Button title="Найзууддаа илгээх" variant="secondary" onPress={share} />
      {link && (
        <Text style={styles.linkText} numberOfLines={1}>
          {link}
        </Text>
      )}

      <Text style={styles.section}>
        Тоглогчид ({view.players.length}/{POKER_MAX_SEATS})
      </Text>
      {/* Тоглогчид ба робот нэмэх — Big Two-гийн лоббитой ижил дараалал, загвар. */}
      {view.players.map((p) => (
        <View key={p.id} style={styles.lobbyRow}>
          <View style={[styles.dot, { backgroundColor: p.connected ? theme.success : theme.textMuted }]} />
          <Text style={styles.lobbyName} numberOfLines={1}>
            {p.name}
            {p.id === view.youId ? ' (та)' : ''}
          </Text>
          {!sng && <Text style={styles.lobbyStack}>{p.stack > 0 ? n(p.stack) : 'Buy-in хийгээгүй'}</Text>}
          {p.bot && <Text style={styles.botTag}>робот</Text>}
          {p.isHost && <Text style={styles.hostBadge}>эзэн</Text>}
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

      {sng && isHost && view.players.length < POKER_MAX_SEATS && (
        <View style={styles.botAdd}>
          <Text style={styles.botAddLabel}>Робот нэмэх</Text>
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
            Найз завгүй үед роботуудтай тоглож болно. Роботтой тоглолт цолд тооцогдохгүй (чип хожиж болно).
          </Text>
        </View>
      )}

      {!sng && firstTime && <CashSeatPanel {...props} />}

      {isHost ? (
        <View style={{ gap: 8 }}>
          {sng ? (
            <>
              <Text style={styles.section}>Buy-in (токен)</Text>
              <View style={styles.choiceWrap}>
                {SNG_BUYIN_CHOICES.map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setBuyIn(v)}
                    style={[styles.choice, buyIn === v && styles.presetOn]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.presetText, buyIn === v && styles.presetTextOn]}>{shortChips(v)}</Text>
                  </Pressable>
                ))}
              </View>
              {prizes.length > 0 && (
                <Text style={styles.muted}>
                  Шагнал ({Math.max(2, entrants)} оролцогч):{' '}
                  {prizes.map((x, i) => `${i + 1}-р ${n(x)}`).join(' · ')}
                </Text>
              )}
            </>
          ) : (
            firstTime && (
              <>
                <Text style={styles.section}>Blinds (токен)</Text>
                <View style={styles.choiceWrap}>
                  {CASH_BLIND_CHOICES.map((c) => (
                    <Pressable
                      key={c.bb}
                      onPress={() => onBlinds(c.sb, c.bb)}
                      style={[styles.choice, view.bb === c.bb && styles.presetOn]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.presetText, view.bb === c.bb && styles.presetTextOn]}>
                        {shortChips(c.sb)}/{shortChips(c.bb)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )
          )}
          <Text style={styles.section}>Бодох хугацаа</Text>
          <View style={styles.choiceWrap}>
            {POKER_TURN_SECONDS_CHOICES.map((v) => (
              <Pressable
                key={v}
                onPress={() => setSecs(v)}
                style={[styles.choice, secs === v && styles.presetOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.presetText, secs === v && styles.presetTextOn]}>{v} сек</Text>
              </Pressable>
            ))}
          </View>
          <Button
            title={sng ? (view.phase === 'finished' ? 'Шинэ тэмцээн эхлүүлэх' : 'Тэмцээн эхлүүлэх') : 'Ширээ эхлүүлэх'}
            onPress={() => onStart(buyIn, secs)}
            disabled={!canStart}
          />
          {!canStart && (
            <Text style={styles.muted}>
              {sng ? 'Дор хаяж 2 тоглогч (робот байж болно) хэрэгтэй.' : 'Buy-in хийсэн дор хаяж 2 тоглогч хэрэгтэй.'}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.muted}>Өрөөний эзэн эхлүүлэхийг хүлээж байна…</Text>
      )}

      <Rules view={view} />
    </View>
  );
}

function Rules({ view }: { view: PokerView }) {
  return (
    <View style={styles.rules}>
      <Text style={styles.rulesTitle}>Дүрэм (Poker TDA 2024 · No-Limit Texas Hold'em)</Text>
      {view.format === 'sng' ? (
        <Text style={styles.rulesText}>
          • Хүн бүр {n(SNG_STARTING_CHIPS)} чиптэй эхэлнэ, Blind {SNG_HANDS_PER_LEVEL} гар тутам өснө; 3-р level-ээс BB
          Ante.{'\n'}• Сүүлд үлдсэн нь түрүүлнэ. Шагнал: 2–4 хүн → 1-р байр бүгдийг; 5–6 → 65/35; 7–9 →
          50/30/20.{'\n'}• Гарсан эсвэл тасарсан тоглогч тэмцээнд үлдэж, Blind нь тавигдсаар байна (Fold/Check
          автоматаар).
        </Text>
      ) : (
        <Text style={styles.rulesText}>
          • Чип = токен. Big Blind-ийн 40–100 дахинаар Buy-in хийж сууна, хүссэн үедээ босоход үлдсэн чип токенд
          буцна.{'\n'}• Дунд нь суувал Big Blind хүрч иртэл хүлээнэ. 3 гар Sit out бол ширээнээс босгоно.{'\n'}• Робот
          суухгүй, зөвхөн бүртгэлтэй тоглогч.
        </Text>
      )}
      <Text style={styles.rulesText}>
        • Min Raise = өмнөх бүрэн Raise; бүрэн бус All-in Raise дахин Raise хийх эрх нээхгүй. Side Pot, Dead Button,
        Showdown-д хожиж чадахгүй гар нуугдана; All-in бол бүх гар ил.
      </Text>
    </View>
  );
}

// ── Үр дүн ──────────────────────────────────────────────────────────────────

function Results({ view }: { view: PokerView }) {
  const rows = view.players
    .filter((p) => p.place !== null)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const winner = view.players.find((p) => p.id === view.winnerId);
  return (
    <View style={styles.results}>
      <Text style={styles.resultsTitle}>🏆 {winner?.name ?? '—'} түрүүллээ!</Text>
      {rows.map((p) => {
        const s = view.settlement?.find((x) => x.playerId === p.id);
        return (
          <View key={p.id} style={styles.resultRow}>
            <Text style={styles.resultPlace}>{p.place}</Text>
            <Text style={styles.resultName} numberOfLines={1}>
              {p.name}
            </Text>
            {s && (
              <Text style={[styles.resultChips, s.amount > 0 ? styles.plus : s.amount < 0 ? styles.minus : null]}>
                {formatSignedChips(s.amount)}
              </Text>
            )}
          </View>
        );
      })}
      <Text style={styles.muted}>{view.handNo} гар тоглогдлоо.</Text>
    </View>
  );
}

function HandLog({ view }: { view: PokerView }) {
  const lines = useMemo(() => view.log.slice(-8), [view.log]);
  return (
    <View style={styles.log}>
      {lines.map((l, i) => (
        <Text key={i} style={styles.logLine} numberOfLines={2}>
          {l}
        </Text>
      ))}
    </View>
  );
}

// ── Загвар ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 140, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  // Утсанд нарийн тул гарчиг ба товчлуурыг хоёр мөрөнд (нэг мөрөнд бол гарчиг шахагдана).
  header: { gap: 8 },
  title: { color: theme.text, fontSize: 17, fontWeight: '800' },
  sub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  subSmall: { color: theme.textMuted, fontSize: 11, marginTop: 1 },
  code: { color: theme.accent, fontWeight: '800', letterSpacing: 1 },
  headerButtons: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  smallBtn: { backgroundColor: theme.surfaceRaised, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  leaveBtn: { backgroundColor: '#5a2a2a' },
  smallBtnText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  spectator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.surfaceRaised,
    padding: 10,
    borderRadius: 10,
  },
  spectatorText: { color: theme.text, fontWeight: '700' },
  spectatorLeave: { color: theme.accent, fontWeight: '700' },

  tableWrap: { width: '100%', height: 420, position: 'relative' },
  felt: {
    position: 'absolute',
    left: 34,
    right: 34,
    top: 34,
    bottom: 34,
    borderRadius: 200,
    backgroundColor: theme.felt,
    borderWidth: 8,
    borderColor: '#5b3a1e',
  },
  center: { position: 'absolute', width: 240, alignItems: 'center', gap: 4 },
  board: { flexDirection: 'row', gap: 4 },
  boardSlot: {
    width: 40,
    height: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed',
  },
  pot: { color: theme.accent, fontWeight: '800', fontSize: 15 },
  potResults: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: 6, gap: 2, maxWidth: 240 },
  potLine: { color: theme.text, fontSize: 11 },
  betChip: {
    position: 'absolute',
    width: 60,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingVertical: 2,
  },
  betText: { color: theme.accent, fontSize: 11, fontWeight: '800' },

  seat: {
    position: 'absolute',
    width: 84,
    backgroundColor: 'rgba(16,35,58,0.94)',
    borderRadius: 10,
    padding: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  seatActing: { borderColor: theme.accent },
  seatWinner: { borderColor: theme.success },
  seatDim: { opacity: 0.5 },
  seatCards: { flexDirection: 'row', gap: 2, marginTop: -26, minHeight: 22 },
  seatInfo: { alignItems: 'center', width: '100%' },
  seatNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  seatDot: { width: 6, height: 6, borderRadius: 3 },
  seatRank: { marginTop: 1 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  meName: { color: theme.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  guestTag: {
    color: theme.textMuted,
    fontSize: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  seatName: { color: theme.text, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  seatNameYou: { color: theme.accent },
  seatStack: { color: theme.text, fontSize: 11, fontWeight: '800' },
  seatAction: { color: '#93c5fd', fontSize: 10 },
  seatHand: { color: theme.success, fontSize: 9, fontWeight: '700' },
  seatAway: { color: theme.textMuted, fontSize: 9, fontStyle: 'italic' },
  badges: { position: 'absolute', top: -8, right: -8, flexDirection: 'row', gap: 2 },
  badge: {
    backgroundColor: '#e5e7eb',
    color: '#111',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeD: { backgroundColor: theme.accent },
  seatTimer: { position: 'absolute', bottom: -12 },

  youPanel: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 12, gap: 10 },
  fabGap: { marginRight: 60 },
  youRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  youCards: { flexDirection: 'row', gap: 6 },
  youStack: { color: theme.text, fontSize: 16, fontWeight: '800' },
  youHand: { color: theme.success, fontSize: 14, fontWeight: '700' },
  waiting: { color: theme.textMuted, textAlign: 'center' },
  muted: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },

  raiseBox: { gap: 6 },
  presetRow: { flexDirection: 'row', gap: 6 },
  preset: { flex: 1, backgroundColor: theme.surfaceRaised, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  presetOn: { backgroundColor: theme.accent },
  presetText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  presetTextOn: { color: '#1b1b1f' },
  amountRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  stepBtn: {
    width: 44,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: theme.text, fontSize: 20, fontWeight: '800' },
  amountInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.surfaceRaised,
    color: theme.text,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { flex: 1, paddingHorizontal: 6 },

  cashBox: { gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 8 },
  cashTitle: { color: theme.text, fontWeight: '800' },

  lobby: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 12, gap: 8 },
  codeEyebrow: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  codeBig: { color: theme.text, fontSize: 40, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  linkText: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
  section: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  lobbyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lobbyName: { color: theme.text, flex: 1, fontSize: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  botTag: {
    color: theme.textMuted,
    fontSize: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hostBadge: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  lobbyStack: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { backgroundColor: theme.surfaceRaised, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  rules: { marginTop: 6, gap: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 8 },
  rulesTitle: { color: theme.text, fontWeight: '700', fontSize: 12 },
  rulesText: { color: theme.textMuted, fontSize: 11, lineHeight: 16 },

  results: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 12, gap: 6 },
  resultsTitle: { color: theme.accent, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultPlace: { color: theme.text, width: 22, fontWeight: '800', textAlign: 'center' },
  resultName: { color: theme.text, flex: 1 },
  resultChips: { color: theme.textMuted, fontWeight: '700' },
  plus: { color: theme.success },
  minus: { color: theme.danger },

  log: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 8, gap: 2 },
  logLine: { color: theme.textMuted, fontSize: 11 },
});
