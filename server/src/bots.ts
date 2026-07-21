/**
 * Гараар турших хэрэгсэл: өгсөн өрөөнд bot тоглогчид нэмж автоматаар тоглуулна.
 * Ганцаараа байхад олон тоглогчтой дүрмүүдийг (өнжих ээлж, оноо) шалгахад тустай.
 *
 *   npm run bots -- <ӨРӨӨНИЙ-КОД> [тоо]
 */

import WebSocket from 'ws';

import { Card } from '../../app/src/shared/cards';
import { Combo, beats, detectCombo } from '../../app/src/shared/combos';
import type { ClientMessage, GameView, ServerMessage } from '../../app/src/shared/protocol';

const CODE = (process.argv[2] ?? '').trim().toUpperCase();
const COUNT = Number(process.argv[3] ?? 4);
const URL = process.env.SMOKE_URL ?? 'ws://localhost:8787';
const NAMES = ['Бат', 'Цэцэг', 'Дорж', 'Энхээ', 'Сараа', 'Ганаа', 'Түвшин'];

if (!CODE) {
  console.error('Хэрэглээ: npm run bots -- <ӨРӨӨНИЙ-КОД> [тоо]');
  process.exit(1);
}

/** Хамгийн сул хууль ёсны тавилтыг сонгоно. */
function pickPlay(hand: Card[], current: Combo | null): Card[] | null {
  for (const size of current ? [current.size] : [1, 2, 3, 5]) {
    if (size > hand.length) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const pick = idx.map((i) => hand[i]);
      const combo = detectCombo(pick);
      if (combo && beats(combo, current)) return pick;
      let k = size - 1;
      while (k >= 0 && idx[k] === hand.length - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return null;
}

for (let i = 0; i < COUNT; i++) {
  const name = NAMES[i % NAMES.length];
  const ws = new WebSocket(URL);
  let me = '';
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));

  ws.on('open', () => send({ t: 'join', name, code: CODE }));
  ws.on('error', (err) => console.error(`${name}: ${err.message}`));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    if (msg.t === 'joined') {
      me = msg.playerId;
      console.log(`${name} нэгдлээ`);
      return;
    }
    if (msg.t === 'error') return console.error(`${name}: ${msg.message}`);
    if (msg.t !== 'state') return;

    const view: GameView = msg.view;
    if (view.phase !== 'playing' || view.turnId !== me) return;
    // Хүн ажиглаж амжихаар бага зэрэг саатуулна.
    setTimeout(() => {
      const current = view.current ? detectCombo(view.current.cards) : null;
      const pick = pickPlay(view.yourHand, current);
      send(pick ? { t: 'play', cards: pick } : { t: 'pass' });
    }, 400);
  });
}
