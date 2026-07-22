import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RANKS, nextRank, promoted, rankFor, rewardBetween } from '../../app/src/shared/ranks';

test('шатууд өсөх дарааллаар, давхардалгүй', () => {
  for (let i = 1; i < RANKS.length; i += 1) {
    assert.ok(RANKS[i].wins > RANKS[i - 1].wins, `${RANKS[i].name} өмнөхөөсөө өндөр биш`);
    assert.notEqual(RANKS[i].name, RANKS[i - 1].name);
  }
  assert.equal(RANKS[0].wins, 0, 'эхний цол 0 хожилтой байх ёстой');
});

test('хожлын тоонд харгалзах цол', () => {
  assert.equal(rankFor(0).name, 'Байлдагч');
  assert.equal(rankFor(1).name, 'Ахлах байлдагч');
  assert.equal(rankFor(2).name, 'Ахлах байлдагч', 'шатны хооронд өмнөх цол хэвээр');
  assert.equal(rankFor(3).name, 'Дэд түрүүч');
  assert.equal(rankFor(16).name, 'Ахлагч');
  assert.equal(rankFor(60).name, 'Ахмад');
  assert.equal(rankFor(205).name, 'Дэслэгч генерал');
  assert.equal(rankFor(244).name, 'Дэслэгч генерал');
  assert.equal(rankFor(245).name, 'Генерал');
  assert.equal(rankFor(99999).name, 'Генерал', 'дээд цолноос цааш өсөхгүй');
});

test('Монгол улсын цэргийн цолны бүрэн жагсаалт багтсан', () => {
  const expected = [
    'Байлдагч', 'Ахлах байлдагч', 'Дэд түрүүч', 'Түрүүч', 'Ахлах түрүүч',
    'Дэд ахлагч', 'Ахлагч', 'Ахлах ахлагч', 'Сургагч ахлагч', 'Тэргүүн ахлагч',
    'Дэслэгч', 'Ахлах дэслэгч', 'Ахмад',
    'Хошууч', 'Дэд хурандаа', 'Хурандаа',
    'Бригадын генерал', 'Хошууч генерал', 'Дэслэгч генерал', 'Генерал',
  ];
  assert.deepEqual(RANKS.map((r) => r.name), expected);
  assert.equal(RANKS.length, 20);
});

test('бүлгүүд дараалан байрлана — холилдохгүй', () => {
  const order = ['Байлдагч', 'Ахлагч', 'Офицер', 'Генерал'];
  const seen = RANKS.map((r) => r.group).filter((g, i, arr) => i === 0 || arr[i - 1] !== g);
  assert.deepEqual(seen, order);
});

test('буруу утгыг хамгийн доод цол гэж үзнэ', () => {
  assert.equal(rankFor(-5).name, 'Байлдагч');
  assert.equal(rankFor(NaN).name, 'Байлдагч');
  assert.equal(rankFor(2.9).name, 'Ахлах байлдагч', 'бутархайг доош нь тоймлоно');
});

test('дараагийн цолд үлдсэн хожил', () => {
  assert.deepEqual(nextRank(0), { rank: RANKS[1], remaining: 1 });
  assert.equal(nextRank(1)?.rank.name, 'Дэд түрүүч');
  assert.equal(nextRank(1)?.remaining, 2);
  assert.equal(nextRank(244)?.remaining, 1);
  assert.equal(nextRank(245), null, 'дээд цолтой бол дараагийнх байхгүй');
  assert.equal(nextRank(1000), null);
});

test('цол ахих мөчийг зөв илрүүлнэ', () => {
  assert.equal(promoted(0, 0), null);
  assert.equal(promoted(1, 2), null, 'нэг шатны дотор ахихгүй');
  assert.equal(promoted(0, 1)?.name, 'Ахлах байлдагч');
  assert.equal(promoted(2, 3)?.name, 'Дэд түрүүч');
  assert.equal(promoted(59, 60)?.name, 'Ахмад');
  assert.equal(promoted(11, 12)?.name, 'Дэд ахлагч');
  // Хэд хэдэн шат нэг дор алгасвал хамгийн сүүлийнхийг нь буцаана.
  assert.equal(promoted(0, 100)?.name, 'Дэд хурандаа');
});

test('тэмдэг бүр богино — нэрний хажууд багтана', () => {
  for (const rank of RANKS) {
    assert.ok(rank.badge.length > 0, `${rank.name}: тэмдэггүй`);
    assert.ok([...rank.badge].length <= 3, `${rank.name}: тэмдэг хэт урт`);
  }
});

test('шагнал зөвхөн ахисан цолнуудынх', () => {
  assert.equal(rewardBetween(0, 0), 0, 'ахиагүй бол шагналгүй');
  assert.equal(rewardBetween(5, 3), 0, 'буурвал шагналгүй');
  assert.equal(rewardBetween(0, 1), RANKS[1].reward, 'эхний цолны шагнал');
  assert.equal(rewardBetween(1, 2), 0, 'нэг шатны дотор шагналгүй');

  // Хэд хэдэн цол нэг дор алгасвал бүгдийн шагнал нэмэгдэнэ.
  const firstThree = RANKS[1].reward + RANKS[2].reward + RANKS[3].reward;
  assert.equal(rewardBetween(0, 5), firstThree, 'алгассан цолны шагнал алдагдахгүй');

  // Хамгийн доод цолд шагнал байхгүй — эхлэлийн цэг учир.
  assert.equal(RANKS[0].reward, 0);
});

test('шагнал цол ахих тусам өсдөг', () => {
  for (let i = 2; i < RANKS.length; i += 1) {
    assert.ok(
      RANKS[i].reward >= RANKS[i - 1].reward,
      `${RANKS[i].name}: шагнал өмнөхөөсөө бага байна`,
    );
  }
});

test('нийт шагнал хэт их биш', () => {
  const total = RANKS.reduce((sum, r) => sum + r.reward, 0);
  // 1 сая бэлэглэдэгтэй харьцуулахад 10 дахин илүүгүй байх ёстой —
  // эс бөгөөс токен утгагүй болж, админаас хүсэх систем үхнэ.
  assert.ok(total <= 10_000_000, `нийт шагнал хэт их: ${total}`);
  assert.ok(total >= 5_000_000, `нийт шагнал хэт бага: ${total}`);
});
