/**
 * Дуут мессеж бичих (вэб).
 *
 * `MediaRecorder` ашиглана — iOS Safari 14.3+, Chrome, Firefox дэмждэг.
 * Native (Expo Go) дээр энэ API байхгүй тул `voiceSupported()` false буцаах
 * бөгөөд UI микрофоны товчийг нуух ёстой.
 */

import { Platform } from 'react-native';

import { MAX_VOICE_MS } from './shared/protocol';

/** Браузер дэмждэг эхний форматыг сонгоно (Safari нь mp4, бусад нь webm). */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function voiceSupported(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return !!navigator.mediaDevices?.getUserMedia;
}

function pickMimeType(): string | undefined {
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface VoiceClip {
  /** `data:audio/…;base64,…` хэлбэрийн бичлэг. */
  data: string;
  /** Бичлэгийн урт (ms). */
  ms: number;
}

export interface Recording {
  /** Бичлэгийг зогсоож үр дүнг буцаана. */
  stop: () => Promise<VoiceClip>;
  /** Бичлэгийг хаяна. */
  cancel: () => void;
}

/**
 * Микрофоноос бичиж эхэлнэ. Хэрэглэгч зөвшөөрөл өгөхгүй бол алдаа шиднэ.
 * `MAX_VOICE_MS` хүрэхэд автоматаар зогсоно.
 */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  let settled = false;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const release = () => stream.getTracks().forEach((track) => track.stop());
  const autoStop = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, MAX_VOICE_MS);

  return {
    stop: () =>
      new Promise<VoiceClip>((resolve, reject) => {
        if (settled) return reject(new Error('Бичлэг аль хэдийн дууссан.'));
        settled = true;
        clearTimeout(autoStop);

        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve({ data: String(reader.result), ms: Date.now() - startedAt });
          reader.onerror = () => reject(new Error('Бичлэгийг уншиж чадсангүй.'));
          reader.readAsDataURL(blob);
        };

        if (recorder.state === 'recording') recorder.stop();
        else recorder.onstop?.(new Event('stop'));
      }),

    cancel: () => {
      settled = true;
      clearTimeout(autoStop);
      recorder.onstop = null;
      if (recorder.state === 'recording') recorder.stop();
      release();
    },
  };
}

/** Дуут мессежийг тоглуулна. Вэб дээр л ажиллана. */
export function playVoice(data: string): void {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return;
  const audio = new Audio(data);
  void audio.play().catch(() => {
    // Хэрэглэгч зөвшөөрөөгүй эсвэл формат дэмжигдэхгүй — чимээгүй өнгөрнө.
  });
}
