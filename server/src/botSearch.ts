/**
 * Гүн хайлттай бот — PIMC (Perfect-Information Monte Carlo).
 *
 * Big Two бол ДАЛД мэдээлэлтэй (өрсөлдөгчийн гар харагдахгүй) тул цэвэр minimax
 * боломжгүй. Оронд нь:
 *   1. Тодорхойгүй хөзрийг (52 − миний гар − тоглогдсон) өрсөлдөгчдийн мэдэгдэж
 *      буй ТООГ хадгалж K "боломжит дэлхий" болгон санамсаргүй тараана.
 *   2. Нэр дэвшигч тавилт бүрд, дэлхий бүрд — төлөвийг хувилж, тавиад, ТОЙРОГ
 *      дуустал хурдан эвристикээр (`chooseMove`) тоглуулна.
 *   3. Ботын дундаж ТОРГУУЛЬ (үлдсэн хөзөр) хамгийн бага тавилтыг сонгоно.
 *
 * Зөвхөн СЕРВЕРТ ажиллана (клиент bundle-д орохгүй). Хүнд тул тооцооллыг
 * хязгаарлаж, нэг шийдвэрийг богино байлгана (event loop-ыг удаан гацаахгүй).
 */

import type { Card } from '../../app/src/shared/cards';
import { chooseMove, legalMoves, moveCost } from '../../app/src/shared/bot';
import { GameState, play, pass } from '../../app/src/shared/game';

/** Хэдэн боломжит дэлхий түүвэрлэх. Их бол илүү нарийн ч удаан. */
const WORLDS = 24;
/** Хэдэн нэр дэвшигч тавилтыг хайх (эвристикээр шүүсэн шилдгүүд + пас). */
const MAX_CANDIDATES = 6;

/** null = пас. Нэр дэвшигч нүүдэл. */
type Candidate = Card[] | null;

/** Fisher-Yates холилт (эх массивыг өөрчлөхгүй). */
function shuffle(arr: Card[], rng: () => number): Card[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Тодорхойгүй хөзөр = бүх 52 − миний гар − тоглогдсон (ил мэдээлэл). */
function unknownCards(hand: Card[], played: Card[]): Card[] {
  const seen = new Uint8Array(52);
  for (const c of hand) seen[c] = 1;
  for (const c of played) seen[c] = 1;
  const out: Card[] = [];
  for (let c = 0; c < 52; c += 1) if (!seen[c]) out.push(c);
  return out;
}

/** Эвристикээр хамгийн боломжlikely нэр дэвшигчдийг сонгоно (+ пас). */
function pickCandidates(moves: Card[][], hand: Card[], following: boolean): Candidate[] {
  const ranked = moves
    .map((m) => ({ m, cost: moveCost(m, hand, 0.5) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.m as Candidate);
  // Дараж байгаа (leading биш) үед ПАС-ыг ч сонголт болгоно — хүчтэй хөзрөө
  // хадгалах нь заримдаа дийлэхээс дээр.
  if (following) ranked.push(null);
  return ranked;
}

/** Тойрог дуустал эвристикээр тоглуулна (rollout). */
function rollout(sim: GameState, rng: () => number): void {
  let guard = 0;
  while (sim.phase === 'playing') {
    if (++guard > 400) break;
    const id = sim.seats[sim.turn];
    const p = sim.players.find((x) => x.id === id);
    if (!p) break;
    const opponentCards = sim.players
      .filter((x) => x.id !== id && x.seated && x.place === null)
      .map((x) => x.hand.length);
    const mv = chooseMove(
      {
        hand: p.hand,
        current: sim.current?.combo ?? null,
        opponentCards,
        playedCards: sim.playedThisRound,
      },
      'hard',
      rng,
    );
    if (mv) play(sim, id, mv);
    else pass(sim, id);
  }
}

/** Тойрог дууссаны дараа ботын торгууль (0 = хожсон). */
function penaltyOf(sim: GameState, playerId: string): number {
  const rec = sim.history[sim.history.length - 1];
  const e = rec?.entries.find((x) => x.playerId === playerId);
  return e?.delta ?? 0;
}

/**
 * Гүн хайлтын нүүдэл. `null` = пас.
 *
 * Хайх боломжгүй (0–1 нүүдэл, эсвэл шууд дуусах нүүдэл) үед шууд буцаана.
 */
export function searchMove(
  state: GameState,
  playerId: string,
  rng: () => number = Math.random,
): Card[] | null {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const current = state.current?.combo ?? null;
  const moves = legalMoves(me.hand, current);
  if (moves.length === 0) return null; // пас (албадан)
  // Энэ нүүдлээр дуусах боломжтой бол шууд ашиглана.
  const finisher = moves.find((m) => m.length === me.hand.length);
  if (finisher) return finisher;
  if (moves.length === 1 && current === null) return moves[0];

  const following = current !== null;
  const candidates = pickCandidates(moves, me.hand, following);

  // Хайх өрсөлдөгчид ба тодорхойгүй хөзөр.
  const opponents = state.players.filter(
    (p) => p.id !== playerId && p.seated && p.place === null,
  );
  const unknown = unknownCards(me.hand, state.playedThisRound);

  const score = candidates.map(() => 0); // дундаж торгуулийн нийлбэр

  for (let w = 0; w < WORLDS; w += 1) {
    // Нэг дэлхий: тодорхойгүй хөзрийг өрсөлдөгчдийн тоогоор тараана.
    const bag = shuffle(unknown, rng);
    let idx = 0;
    const sampled = new Map<string, Card[]>();
    for (const opp of opponents) {
      sampled.set(opp.id, bag.slice(idx, idx + opp.hand.length));
      idx += opp.hand.length;
    }

    for (let c = 0; c < candidates.length; c += 1) {
      const cand = candidates[c];
      const sim: GameState = structuredClone(state);
      // Өрсөлдөгчдийн гарыг түүврээр орлуулна.
      for (const opp of opponents) {
        const sp = sim.players.find((p) => p.id === opp.id);
        if (sp) sp.hand = (sampled.get(opp.id) ?? []).slice();
      }
      try {
        if (cand === null) pass(sim, playerId);
        else play(sim, playerId, cand);
      } catch {
        score[c] += 999; // хууль бус — хүнд торгууль
        continue;
      }
      rollout(sim, rng);
      score[c] += penaltyOf(sim, playerId);
    }
  }

  // Хамгийн бага дундаж торгуультай нүүдлийг сонгоно.
  let best = 0;
  for (let c = 1; c < candidates.length; c += 1) {
    if (score[c] < score[best]) best = c;
  }
  return candidates[best];
}
