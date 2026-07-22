/**
 * Төхөөрөмжөөс зураг сонгож, аватар болгон бэлтгэх.
 *
 * Зургийг ХЭЗЭЭ Ч анхны хэмжээгээр нь илгээхгүй: 128×128 квадрат болгож
 * тайрч, JPEG болгон шахна. Ингэснээр 8 мегапикселийн гэрэл зураг ~10KB болж,
 * сангийн мөр ч, сүлжээний ачаалал ч хэвийн хэвээр үлдэнэ.
 *
 * Одоогоор зөвхөн вэб дээр ажиллана — апп вэбээр л түгээгддэг. Төрөлхийн
 * платформ дээр бэлэн дүрснүүд ашиглагдана.
 */

import { Platform } from 'react-native';

import { AVATAR_PIXELS, MAX_AVATAR_CHARS } from './shared/avatar';

export function photoPickerSupported(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

export class PhotoError extends Error {}

/**
 * Зураг сонгуулж, шахсан data URL буцаана.
 * Хэрэглэгч цонхыг хаавал `null` буцна.
 */
export async function pickAvatarPhoto(): Promise<string | null> {
  if (!photoPickerSupported()) throw new PhotoError('Энэ төхөөрөмж дээр зураг оруулах боломжгүй.');

  const file = await chooseFile();
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new PhotoError('Зураг файл сонгоно уу.');

  const bitmap = await loadImage(file);
  const dataUrl = toSquareJpeg(bitmap);
  if (dataUrl.length > MAX_AVATAR_CHARS) {
    throw new PhotoError('Зураг хэтэрхий том байна. Өөр зураг сонгоно уу.');
  }
  return dataUrl;
}

function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    // Цонх хаагдсаныг хөтөч найдвартай мэдэгддэггүй тул фокус буцахад шалгана.
    const done = (value: File | null) => {
      input.remove();
      resolve(value);
    };
    input.onchange = () => done(input.files?.[0] ?? null);
    input.oncancel = () => done(null);
    document.body.appendChild(input);
    input.click();
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError('Зургийг уншиж чадсангүй.'));
    };
    img.src = url;
  });
}

/** Голоос нь квадрат хэлбэрээр тайрч, AVATAR_PIXELS хэмжээнд шахна. */
function toSquareJpeg(img: HTMLImageElement): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Зургийг боловсруулж чадсангүй.');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PIXELS, AVATAR_PIXELS);
  return canvas.toDataURL('image/jpeg', 0.82);
}
