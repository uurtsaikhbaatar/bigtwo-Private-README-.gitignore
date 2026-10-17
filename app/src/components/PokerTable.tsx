/**
 * Texas Hold'em ширээ — онлайн покерын (GGPoker маягийн) загвар:
 *   • бараан дэвсгэр дээр уралдааны зам (stadium) хэлбэртэй ширээ: хар
 *     зөөлөвчтэй хүрээ → голдоо гэрэлтсэн ногоон даавуу → нимгэн betting line;
 *   • дээд талд "Total Pot" капсул, голд нь том ширээний хөзөр;
 *   • суудал: дугуй зураг, доор нь бараан хавтан дээр нэр + stack (цэнхэр);
 *     хөзөр зургийн дээгүүр сэнс шиг; D товчны жетон, бооцооны чип;
 *   • ялагч дээр алтан "WIN".
 *
 * Утсанд (босоо дэлгэц) ширээ босоо, компьютерт хэвтээ. ТАНЫ суудал үргэлж доор.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { useTurnCountdown } from './TurnTimer';
import { groupDigits } from '../chips';
import { Card, isRed, rankName, suitName } from '../shared/cards';
import { POKER_MAX_SEATS } from '../shared/holdem/structure';
import type { PokerPlayerView, PokerView } from '../shared/holdem/view';

const n = groupDigits;

interface Props {
  view: PokerView;
  onInspect: (playerId: string, name: string) => void;
}

// ── Хөзөр ───────────────────────────────────────────────────────────────────

/** Өргөнөөр нь масштаблагдах хөзөр (зураг дээрх шиг том үсэг, баруун доор том дүрс). */
export function PkCard({ card, w, back, style }: { card?: Card; w: number; back?: boolean; style?: object }) {
  const h = Math.round(w * 1.4);
  if (back || card === undefined) {
    return (
      <View style={[cs.card, cs.back, { width: w, height: h, borderRadius: w * 0.12 }, style]}>
        <View style={[cs.backInner, { borderRadius: w * 0.08 }]} />
      </View>
    );
  }
  const color = isRed(card) ? '#e0262f' : '#141414';
  return (
    <View style={[cs.card, { width: w, height: h, borderRadius: w * 0.12 }, style]}>
      <Text style={[cs.rank, { color, fontSize: w * 0.44, left: w * 0.1, top: w * 0.02 }]}>{rankName(card)}</Text>
      <Text style={[cs.suitSmall, { color, fontSize: w * 0.3, left: w * 0.12, top: w * 0.5 }]}>
        {suitName(card)}
      </Text>
      <Text style={[cs.suitBig, { color, fontSize: w * 0.62, right: w * 0.06, bottom: -w * 0.04 }]}>
        {suitName(card)}
      </Text>
    </View>
  );
}

// ── Ширээ ───────────────────────────────────────────────────────────────────

/** Хуудасны дотоод зай (PokerScreen: padding 12, maxWidth 720). */
const PAGE_PAD = 24;
const PAGE_MAX = 720;

export function PokerTable({ view, onInspect }: Props) {
  // Өргөнийг цонхноос шууд — утас эргүүлэх/цонх өөрчлөхөд тэр дороо дахин зурна.
  const { width: winW } = useWindowDimensions();
  const W = Math.min(winW, PAGE_MAX) - PAGE_PAD;
  const portrait = W < 560;
  // Өндрийг өргөнөөс: утсанд босоо, компьютерт хэвтээ ширээ.
  const H = portrait ? Math.min(600, Math.max(470, Math.round(W * 1.42))) : Math.min(560, Math.max(380, Math.round(W * 0.62)));

  // Хүрээний хэмжээ (суудлууд хүрээн дээр сууна).
  const rail = portrait
    ? { left: 46, right: 46, top: 78, bottom: 96 }
    : { left: 90, right: 90, top: 66, bottom: 74 };
  const railW = W - rail.left - rail.right;
  const railH = H - rail.top - rail.bottom;
  const railR = Math.min(railW, railH) / 2; // уралдааны замын хагас дугуй үзүүр
  const cx = rail.left + railW / 2;
  const cy = rail.top + railH / 2;

  const me = view.players.find((p) => p.id === view.youId);
  const anchor = me?.seat ?? 0;
  const secondsLeft = useTurnCountdown(view.turnRemainingMs, view.turnSeq);

  /**
   * 9 суудлын байрлал: хүрээн дээрх эллипсийн УРТЫН дагуу тэнцүү зайтай (өнцгөөр
   * тэнцүү хуваавал нарийн үзүүрт суудлууд давхцдаг). k=0 (та) доод төв,
   * цагийн зүүний дагуу.
   */
  const slots = useMemo(() => {
    const rx = railW / 2 + 4;
    const ry = railH / 2 + 4;
    const N = 720;
    const pts: { x: number; y: number }[] = [];
    const cum: number[] = [0];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI / 2 + (i / N) * 2 * Math.PI;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
      if (i > 0) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = cum[N];
    return Array.from({ length: POKER_MAX_SEATS }, (_, k) => {
      const target = (k / POKER_MAX_SEATS) * total;
      let i = 0;
      while (i < N && cum[i] < target) i++;
      return pts[i];
    });
  }, [railW, railH, cx, cy]);
  const seatPoint = (seat: number) => slots[(seat - anchor + POKER_MAX_SEATS) % POKER_MAX_SEATS];
  /** Суудлаас төв рүү `t` хувь шилжсэн цэг (бооцоо, D жетон). */
  const toward = (seat: number, t: number) => {
    const p = seatPoint(seat);
    return { x: p.x + (cx - p.x) * t, y: p.y + (cy - p.y) * t };
  };

  const showResult = view.phase === 'handEnd' || view.phase === 'finished';
  const winners = new Set(showResult ? view.pots.flatMap((p) => p.winners) : []);
  const boardW = Math.min(portrait ? 50 : 66, Math.floor((railW * (portrait ? 0.8 : 0.62)) / 5.5));
  const buttonPlayer = view.players.find((p) => p.isButton);

  return (
    <View style={[styles.wrap, { height: H }]}>
      {/* Хүрээ → даавуу → гэрэл → betting line */}
      <View
        style={[
          styles.rail,
          { left: rail.left, top: rail.top, width: railW, height: railH, borderRadius: railR },
        ]}
      >
        <View style={[styles.felt, { borderRadius: railR - 12 }]}>
          <View style={[styles.bettingLine, { borderRadius: railR - 34 }]} />
        </View>
      </View>

      {/* Төв: Total Pot, ширээний хөзөр, сав хуваалт */}
      <View style={[styles.center, { left: cx - 170, top: cy - boardW * 1.4 / 2 - 34, width: 340 }]}>
        {(view.pot > 0 || view.board.length > 0) && (
          <View style={styles.potPill}>
            <Text style={styles.potText}>Total Pot : {n(view.pot)}</Text>
          </View>
        )}
        <View style={[styles.board, { gap: Math.max(3, boardW * 0.08) }]}>
          {view.board.map((c) => (
            <PkCard key={c} card={c} w={boardW} />
          ))}
        </View>
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

      {/* Бооцооны чип (суудлаас төв рүү) */}
      {view.players
        .filter((p) => p.bet > 0)
        .map((p) => {
          const at = toward(p.seat, 0.5);
          return (
            <View key={`bet-${p.id}`} style={[styles.bet, { left: at.x - 40, top: at.y - 11 }]}>
              <View style={styles.chip}>
                <View style={styles.chipInner} />
              </View>
              <Text style={styles.betText}>{n(p.bet)}</Text>
            </View>
          );
        })}

      {/* Dealer button */}
      {buttonPlayer && (() => {
        const at = toward(buttonPlayer.seat, 0.26);
        const off = buttonPlayer.seat === anchor ? 46 : 0; // доод суудлын хажуу тийш
        return (
          <View style={[styles.dealer, { left: at.x - 11 + off, top: at.y - 11 }]}>
            <Text style={styles.dealerText}>D</Text>
          </View>
        );
      })()}

      {view.players.map((p) => {
        const at = seatPoint(p.seat);
        const you = p.id === view.youId;
        return (
          <Seat
            key={p.id}
            p={p}
            you={you}
            acting={view.toAct === p.id}
            winner={winners.has(p.id)}
            secondsLeft={view.toAct === p.id ? secondsLeft : null}
            turnSeconds={view.turnSeconds}
            compact={portrait}
            x={at.x}
            y={at.y}
            onPress={() => onInspect(p.id, p.name)}
          />
        );
      })}
    </View>
  );
}

// ── Суудал ──────────────────────────────────────────────────────────────────

const AVATAR = 54;
const SEAT_W = 104;
/** Утсанд (босоо) жижиг суудал — 9 суудал нарийн дэлгэцэнд багтана. */
const AVATAR_SM = 44;
const SEAT_W_SM = 84;

function Seat({
  p,
  you,
  acting,
  winner,
  secondsLeft,
  turnSeconds,
  compact,
  x,
  y,
  onPress,
}: {
  p: PokerPlayerView;
  you: boolean;
  acting: boolean;
  winner: boolean;
  secondsLeft: number | null;
  turnSeconds: number;
  compact: boolean;
  x: number;
  y: number;
  onPress: () => void;
}) {
  const out = p.eliminated || (!p.dealt && p.stack === 0 && !p.waitBB);
  const dim = p.folded || out;
  const av = compact ? AVATAR_SM : AVATAR;
  const sw = compact ? SEAT_W_SM : SEAT_W;
  const cardW = compact ? (you ? 40 : p.hole ? 32 : 24) : you ? 46 : p.hole ? 38 : 30;
  const showCards = p.hole ?? (p.hasCards ? [undefined, undefined] : null);
  const progress = secondsLeft !== null ? Math.max(0, Math.min(1, secondsLeft / Math.max(1, turnSeconds))) : 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.seat, { width: sw, left: x - sw / 2, top: y - av / 2 - 6 }]}
    >
      {/* Хөзөр — зургийн дээгүүр сэнс шиг */}
      {showCards && (
        <View style={[styles.hole, { top: -cardW * 1.4 * (you ? 0.78 : 0.62) }, dim && styles.dim]}>
          {showCards.map((c, i) => (
            <PkCard
              key={i}
              card={c}
              w={cardW}
              back={c === undefined}
              style={{
                marginLeft: i === 0 ? 0 : -cardW * 0.42,
                transform: [{ rotate: i === 0 ? '-7deg' : '7deg' }, { translateY: i === 0 ? 0 : 2 }],
              }}
            />
          ))}
        </View>
      )}

      {/* Зураг: ээлж/ялагч бол алтан цагираг */}
      <View
        style={[
          styles.avatarRing,
          { width: av + 6, height: av + 6, borderRadius: (av + 6) / 2 },
          acting && styles.ringActing,
          winner && styles.ringWinner,
          dim && styles.dim,
        ]}
      >
        <Avatar name={p.name} avatar={p.avatar} size={av} />
        {!p.connected && <View style={styles.offline} />}
      </View>

      {/* Нэр + stack хавтан */}
      <View style={[styles.plate, { minWidth: sw - 12, maxWidth: sw }, acting && styles.plateActing, dim && styles.dim]}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, you && styles.nameYou]} numberOfLines={1}>
            {p.name}
          </Text>
          {p.rankedWins !== null && <RankBadge wins={p.rankedWins} />}
        </View>
        <Text style={styles.stack}>
          {p.eliminated ? `#${p.place}` : n(p.stack)}
          {p.allIn ? '  All-in' : ''}
        </Text>
        {acting && secondsLeft !== null && (
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${progress * 100}%` }, secondsLeft <= 5 && styles.timerWarn]} />
          </View>
        )}
      </View>

      {/* Сүүлийн үйлдэл / байхгүй */}
      {!p.eliminated && (p.lastAction || p.sittingOut || p.waitBB) && (
        <Text style={styles.action} numberOfLines={1}>
          {p.waitBB ? 'BB хүлээж байна' : p.sittingOut && !p.lastAction ? 'Sit out' : p.lastAction}
        </Text>
      )}
      {p.handLabel && p.hole && (
        <Text style={styles.handLabel} numberOfLines={1}>
          {p.handLabel}
        </Text>
      )}

      {/* WIN */}
      {winner && (
        <View pointerEvents="none" style={styles.winWrap}>
          <Text style={styles.win}>WIN</Text>
          {p.won > 0 && <Text style={styles.winAmount}>+{n(p.won)}</Text>}
        </View>
      )}
    </Pressable>
  );
}

// ── Загвар ──────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  card: {
    backgroundColor: '#fbfbf8',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
    elevation: 4,
    overflow: 'hidden',
  },
  rank: { position: 'absolute', fontWeight: '800', includeFontPadding: false },
  suitSmall: { position: 'absolute', includeFontPadding: false },
  suitBig: { position: 'absolute', includeFontPadding: false },
  back: { backgroundColor: '#8b1424', padding: 3, borderColor: '#f3e3c3' },
  backInner: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: '#a51d30' },
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#161616',
    borderRadius: 18,
    overflow: 'hidden',
  },
  rail: {
    position: 'absolute',
    backgroundColor: '#1b1b1b',
    borderWidth: 2,
    borderColor: '#2e2e2e',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.85,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  // Голдоо гэрэлтсэн мэт: цайвар ногоон суурь + ирмэг рүү жигд бараан (inset сүүдэр).
  felt: {
    flex: 1,
    backgroundColor: '#2a8443',
    borderWidth: 2,
    borderColor: '#0f3b1d',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 90px 24px rgba(0, 0, 0, 0.55)',
  },
  bettingLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: 22,
    bottom: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.13)',
  },

  center: { position: 'absolute', alignItems: 'center', gap: 8 },
  potPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 3,
  },
  potText: { color: '#f6d77a', fontSize: 14, fontWeight: '700' },
  board: { flexDirection: 'row' },
  potResults: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 6, gap: 2, maxWidth: 300 },
  potLine: { color: '#f2f2f2', fontSize: 11, textAlign: 'center' },

  bet: {
    position: 'absolute',
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#d4a017',
    borderWidth: 2,
    borderColor: '#fff3c4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff3c4' },
  betText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  dealer: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f5ecd2',
    borderWidth: 2,
    borderColor: '#b9852b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  dealerText: { color: '#6b4a12', fontSize: 11, fontWeight: '900' },

  seat: { position: 'absolute', width: SEAT_W, alignItems: 'center' },
  hole: { position: 'absolute', flexDirection: 'row', zIndex: 0 },
  avatarRing: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    borderWidth: 3,
    borderColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
    zIndex: 1,
  },
  ringActing: { borderColor: '#f2b705' },
  ringWinner: { borderColor: '#ffd54a', shadowColor: '#ffcc33', shadowOpacity: 0.9, shadowRadius: 12 },
  offline: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e2574c',
    borderWidth: 2,
    borderColor: '#161616',
  },
  plate: {
    marginTop: -8,
    minWidth: 92,
    maxWidth: SEAT_W,
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    zIndex: 2,
  },
  plateActing: { borderColor: '#f2b705' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  name: { color: '#f4f4f4', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  nameYou: { color: '#ffd54a' },
  stack: { color: '#6ec1ff', fontSize: 13, fontWeight: '800' },
  timerTrack: { width: '100%', height: 3, backgroundColor: '#333', borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  timerFill: { height: 3, backgroundColor: '#f2b705' },
  timerWarn: { backgroundColor: '#e2574c' },
  action: {
    marginTop: 2,
    color: '#cfe3ff',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    overflow: 'hidden',
    zIndex: 2,
  },
  handLabel: { color: '#7ee2a0', fontSize: 9, fontWeight: '800', zIndex: 2 },
  dim: { opacity: 0.45 },
  winWrap: { position: 'absolute', top: -14, alignItems: 'center', zIndex: 3 },
  win: {
    color: '#ffd54a',
    fontSize: 30,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: '#a86b00',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  winAmount: { color: '#ffe8a3', fontSize: 12, fontWeight: '900', marginTop: -4 },
});
