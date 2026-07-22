import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AVATAR_PRESETS,
  MAX_AVATAR_CHARS,
  isPhoto,
  isValidAvatar,
} from '../../app/src/shared/avatar';

test('бэлэн дүрснүүд бүгд хүчинтэй', () => {
  for (const preset of AVATAR_PRESETS) {
    assert.ok(isValidAvatar(preset), `${preset} хүчингүй гэж үзлээ`);
    assert.equal(isPhoto(preset), false, `${preset} зураг гэж бодлоо`);
  }
});

test('зөв data URL хүлээн авна', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  assert.ok(isValidAvatar(png));
  assert.ok(isPhoto(png));
  assert.ok(isValidAvatar('data:image/jpeg;base64,/9j/4AAQSkZJRg=='));
  assert.ok(isValidAvatar('data:image/webp;base64,UklGRh4AAABXRUJQ'));
});

test('аюултай эсвэл буруу утгыг татгалзана', () => {
  // SVG дотор script агуулж болдог тул зөвшөөрөхгүй.
  assert.equal(isValidAvatar('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(isValidAvatar('data:text/html;base64,PGgxPmhpPC9oMT4='), false);
  assert.equal(isValidAvatar('javascript:alert(1)'), false);
  assert.equal(isValidAvatar('https://example.com/зураг.png'), false);
  assert.equal(isValidAvatar('<script>alert(1)</script>'), false);

  assert.equal(isValidAvatar(''), false);
  assert.equal(isValidAvatar(null), false);
  assert.equal(isValidAvatar(42), false);
  assert.equal(isValidAvatar({}), false);
});

test('хэтэрхий том зургийг татгалзана', () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_AVATAR_CHARS);
  assert.ok(huge.length > MAX_AVATAR_CHARS);
  assert.equal(isValidAvatar(huge), false);

  // Хязгаарын дотор бол зөвшөөрнө.
  const padding = MAX_AVATAR_CHARS - 'data:image/png;base64,'.length;
  const edge = 'data:image/png;base64,' + 'A'.repeat(padding);
  assert.equal(edge.length, MAX_AVATAR_CHARS);
  assert.ok(isValidAvatar(edge));
});

test('урт бичвэрийг дүрс гэж андуурахгүй', () => {
  assert.equal(isValidAvatar('маш урт нэр байна'), false);
  assert.equal(isValidAvatar('<b>'), false);
});
