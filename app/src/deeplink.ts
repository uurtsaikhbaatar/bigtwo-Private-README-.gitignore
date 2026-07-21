/**
 * `?code=XXXXXX` хэлбэрийн линкээр шууд өрөөнд орох дэмжлэг.
 *
 * Ингэснээр найзууддаа ганц линк илгээхэд хангалттай болно — код гараар
 * бичих шаардлагагүй.
 */

import { Platform } from 'react-native';

const PARAM = 'code';
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

const onWeb = (): boolean => Platform.OS === 'web' && typeof window !== 'undefined';

/** Хаягт өрөөний код байвал буцаана. */
export function pendingRoomCode(): string | null {
  if (!onWeb()) return null;
  try {
    const raw = new URLSearchParams(window.location.search).get(PARAM);
    const code = raw?.trim().toUpperCase() ?? '';
    return CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Өрөөнд орсны дараа хаягнаас кодыг цэвэрлэнэ.
 * Хуудсыг дахин ачаалахад хуучирсан кодоор дахин оролдохоос сэргийлнэ.
 */
export function clearRoomCodeFromUrl(): void {
  if (!onWeb()) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // Хаяг өөрчлөх боломжгүй бол алгасна.
  }
}

/**
 * Найзууддаа илгээх бүтэн линк. Вэб дээр л боломжтой (native дээр `null`),
 * учир нь бусад тохиолдолд аль хаягаас үйлчилж байгааг мэдэхгүй.
 */
export function joinUrl(code: string): string | null {
  if (!onWeb()) return null;
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set(PARAM, code);
    return url.toString();
  } catch {
    return null;
  }
}
