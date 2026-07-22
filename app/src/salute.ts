/**
 * Ёслолын буудлага — дууны файлгүйгээр.
 *
 * Дууг Web Audio-гоор шууд нийлэгжүүлнэ: mp3 татахгүй, эрхийн асуудалгүй,
 * апп хүндрэхгүй. Буудлага нь шуугиан + намхан цохилтоос, бүрээ нь энгийн
 * долгионоос бүрдэнэ.
 *
 * Хөтөч нь хэрэглэгч нэг ч удаа дараагүй бол дуу тоглуулахыг хориглодог тул
 * эхний хүрэлтэд `unlockAudio()` дуудаж контекстийг сэрээнэ.
 *
 * Зөвхөн вэб дээр ажиллана — апп вэбээр л түгээгддэг. Төрөлхийн платформ дээр
 * чимээгүй өнгөрнө.
 */

import { Platform } from 'react-native';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function soundSupported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'AudioContext' in window;
}

/**
 * Хэрэглэгчийн эхний хүрэлтээр дуудна. Хөтөч дуу тоглуулах зөвшөөрлийг
 * зөвхөн жинхэнэ үйлдлийн дараа өгдөг.
 */
export function unlockAudio(): void {
  if (!soundSupported()) return;
  try {
    ctx ??= new window.AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Нэг буудлага: хурдан цохилт + намхан нүргээн. */
function boom(at: number, gain: number): void {
  if (!ctx) return;

  // Шуугиан — дэлбэрэлтийн "тас" гэсэн хэсэг.
  const seconds = 0.9;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    // Хожуу дээж бүр сулрах тул сүүлдээ өөрөө намжина.
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(900, at);
  lowpass.frequency.exponentialRampToValueAtTime(120, at + 0.5);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, at);
  noiseGain.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);

  noise.connect(lowpass).connect(noiseGain).connect(ctx.destination);
  noise.start(at);
  noise.stop(at + seconds);

  // Намхан цохилт — цээжинд мэдрэгдэх хэсэг.
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(110, at);
  thump.frequency.exponentialRampToValueAtTime(38, at + 0.35);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, at);
  thumpGain.gain.exponentialRampToValueAtTime(gain * 1.1, at + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);

  thump.connect(thumpGain).connect(ctx.destination);
  thump.start(at);
  thump.stop(at + 0.6);
}

/** Бүрээний богино аялгуу. */
function fanfare(at: number, gain: number): void {
  if (!ctx) return;
  // Соль–до–ми–соль (нэг октав дээш) — ёслолын танил өнгө аяс.
  const notes = [392, 523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const start = at + i * 0.17;
    const length = i === notes.length - 1 ? 0.7 : 0.2;

    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);

    osc.connect(g).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + length + 0.05);
  });
}

/**
 * Ёслолын буудлага тоглуулна.
 *
 * `mine` үнэн бол цол авсан хүн өөрөө — гурван буудлага, бүрээтэй, чанга.
 * Бусдад нэг буудлага, намуухан: тоглоомоо бодож байгаа хүнийг сандаргахгүй.
 */
export function playSalute(mine: boolean): void {
  if (muted || !soundSupported()) return;
  unlockAudio();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime + 0.05;
  if (mine) {
    boom(now, 0.5);
    boom(now + 0.45, 0.5);
    boom(now + 0.9, 0.5);
    fanfare(now + 1.35, 0.16);
  } else {
    boom(now, 0.16);
  }
}
