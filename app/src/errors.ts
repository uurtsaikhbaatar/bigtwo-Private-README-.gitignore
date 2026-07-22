/**
 * Аппад гарсан алдааг автоматаар барьж, серверт мэдэгдэнэ.
 *
 * Тоглогч алдаа гарсныг мэдэгдэх шаардлагагүй — апп өөрөө хэлнэ. Ижил алдаа
 * дахин дахин илгээхээс сэргийлж давхардлыг шүүж, нэг сесс дэх тоог хязгаарлана.
 */

import { Platform } from 'react-native';

/** Нэг сесст илгээх автомат мэдэгдлийн дээд тоо. */
const MAX_AUTO_REPORTS = 5;

type Reporter = (kind: 'crash', text: string, context: Record<string, unknown>) => void;

let sent = 0;
const seen = new Set<string>();
let installed = false;

/**
 * Глобал алдаа баригчийг суулгана. Дахин дуудахад юу ч хийхгүй.
 * Салгах функц буцаана.
 */
export function installErrorReporter(report: Reporter): () => void {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  installed = true;

  const submit = (text: string, context: Record<string, unknown>) => {
    const key = text.slice(0, 200);
    if (sent >= MAX_AUTO_REPORTS || seen.has(key)) return;
    seen.add(key);
    sent += 1;
    report('crash', text, { ...context, auto: true });
  };

  const onError = (event: ErrorEvent) => {
    submit(event.message || 'Тодорхойгүй алдаа', {
      stack: event.error?.stack?.slice(0, 1500),
      source: `${event.filename}:${event.lineno}:${event.colno}`,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    submit(
      reason instanceof Error ? reason.message : String(reason).slice(0, 300),
      { stack: reason instanceof Error ? reason.stack?.slice(0, 1500) : undefined },
    );
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    installed = false;
  };
}

/** Мэдэгдэлд хавсаргах орчны мэдээлэл. */
export function deviceContext(): Record<string, unknown> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    platform: Platform.OS,
    userAgent: nav?.userAgent?.slice(0, 300),
    language: nav?.language,
    screen:
      typeof window === 'undefined' ? undefined : `${window.innerWidth}x${window.innerHeight}`,
  };
}
