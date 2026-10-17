/**
 * Покерын робот.
 *
 * Зөвхөн ИЛ мэдээлэл ашиглана: өөрийн 2 хөзөр, ширээний хөзөр, сав, бооцоо,
 * өрсөлдөгчийн тоо. Бусдын хөзрийг хэзээ ч харахгүй.
 *
 * Арга: ялах магадлалыг (equity) санамсаргүй загварчлалаар (Monte Carlo)
 * тооцож, дагах бооцооны харьцаатай (pot odds) жишнэ.
 *   анхан шат — сул, их дагадаг, бараг өсгөдөггүй
 *   дунд     — магадлал/харьцаагаар зөв дагаж, хүчтэй гараар өсгөнө
 *   сайн     — илүү нарийн загварчлал, байрлал ба хэмжээ, хааяа хуурна (bluff)
 */

import type { BotLevel } from '../bot';
import { Card, fullDeck } from '../cards';
import { PokerAction, PokerState, legalActions, potTotal } from './engine';
import { bestHand } from './evaluator';

const SAMPLES: Record<BotLevel, number> = { easy: 60, medium: 180, hard: 400 };

/** Санамсаргүй тархсан гартай `opponents` өрсөлдөгчийн эсрэг ялах магадлал (тэнцлийг хуваана). */
export function equity(
  hole: Card[],
  board: Card[],
  opponents: number,
  samples: number,
  rng: () => number = Math.random,
): number {
  const known = new Set([...hole, ...board]);
  const rest = fullDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let i = 0; i < samples; i++) {
    // Хэрэгтэй хэдэн хөзрийг л холино (Fisher-Yates-ийн эхний хэсэг).
    const need = opponents * 2 + (5 - board.length);
    const deck = rest.slice();
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rng() * (deck.length - k));
      [deck[k], deck[j]] = [deck[j], deck[k]];
    }
    const fullBoard = board.concat(deck.slice(opponents * 2, need));
    const mine = bestHand(hole.concat(fullBoard)).score;
    let best = 0;
    let ties = 0;
    let lost = false;
    for (let o = 0; o < opponents; o++) {
      const s = bestHand([deck[o * 2], deck[o * 2 + 1], ...fullBoard]).score;
      if (s > mine) {
        lost = true;
        break;
      }
      if (s === mine) ties += 1;
      best = Math.max(best, s);
    }
    if (!lost) score += 1 / (ties + 1);
  }
  return score / samples;
}

export function choosePokerAction(
  state: PokerState,
  id: string,
  level: BotLevel,
  rng: () => number = Math.random,
): PokerAction {
  const la = legalActions(state, id);
  if (!la) return { kind: 'fold' };
  const me = state.players.find((p) => p.id === id)!;
  const opponents = Math.max(1, state.players.filter((p) => p.id !== id && p.dealt && !p.folded).length);
  const e = equity(me.hole, state.board, opponents, SAMPLES[level], rng);
  const pot = potTotal(state);
  const toCall = la.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const fair = 1 / (opponents + 1);
  const bb = Math.max(1, state.bb);

  const raiseTo = (target: number): PokerAction => {
    if (!la.canRaise) return toCall > 0 ? { kind: 'call' } : { kind: 'check' };
    const to = Math.max(la.minTo, Math.min(la.maxTo, Math.round(target)));
    return to >= la.maxTo ? { kind: 'allin' } : { kind: 'raise', amount: to };
  };
  const passive = (): PokerAction => (la.canCheck ? { kind: 'check' } : { kind: 'fold' });
  const call = (): PokerAction => (toCall > 0 ? { kind: 'call' } : { kind: 'check' });

  // Стек бага (big blind-ийн 10-аас доош) бол push/fold.
  const shortStack = me.stack + me.street <= bb * 10;

  if (level === 'easy') {
    if (e > 0.8 && rng() < 0.5) return raiseTo(state.currentBet + pot * 0.5);
    if (e + 0.12 >= potOdds || toCall <= bb) return rng() < 0.08 ? passive() : call();
    return passive();
  }

  const strong = level === 'hard' ? Math.min(0.85, fair * 1.7) : Math.min(0.88, fair * 1.9);
  const value = level === 'hard' ? Math.min(0.7, fair * 1.3) : Math.min(0.75, fair * 1.4);

  if (shortStack && level === 'hard') {
    if (e >= Math.max(potOdds, fair * 1.15)) return la.canRaise ? { kind: 'allin' } : call();
    return passive();
  }

  if (e >= strong) {
    // Хүчтэй: савны 2/3 – бүтэн хэмжээгээр өсгөнө (preflop: 3 big blind).
    const size = state.street === 'preflop' ? state.currentBet * 3 : state.currentBet + pot * (0.66 + rng() * 0.34);
    return raiseTo(size);
  }
  if (e >= value) {
    if (toCall === 0 && rng() < (level === 'hard' ? 0.55 : 0.35)) {
      return raiseTo(state.street === 'preflop' ? bb * 2.5 : pot * 0.5);
    }
    return call();
  }
  // Дагах эсэх: магадлал ≥ савны харьцаа (бага зэрэг нөөцтэй).
  if (toCall > 0 && e >= potOdds + (level === 'hard' ? 0.03 : 0.0)) return call();
  // Сайн робот: бусад нь өнжсөн бол хааяа хуурна (river/turn).
  if (level === 'hard' && toCall === 0 && state.street !== 'preflop' && opponents <= 2 && rng() < 0.12) {
    return raiseTo(pot * 0.6);
  }
  return passive();
}
