/**
 * Имэйлийн тохиргоог шалгана — жинхэнэ захидал илгээж үзнэ.
 *
 *   npm run email:test -- өөрийн@имэйл.хаяг
 *
 * Тохируулаагүй бол консол горимд ажиллаж, юу илгээх байсныг харуулна.
 */

import { emailProvider, sendEmail, verificationEmail } from './email';

const to = process.argv[2];
if (!to) {
  console.error('Хэрэглээ: npm run email:test -- өөрийн@имэйл.хаяг');
  process.exit(1);
}

const provider = emailProvider();
console.log(`Үйлчилгээ: ${provider}`);
if (provider === 'console') {
  console.log('EMAIL_PROVIDER тохируулаагүй тул зөвхөн лог руу бичнэ.\n');
}

try {
  const message = verificationEmail('Тэст', '123456');
  await sendEmail({ to, ...message });
  console.log(
    provider === 'console'
      ? '\n✓ Консол горим ажиллаж байна.'
      : `\n✓ ${to} руу илгээлээ. Ирсэн эсэхийг (спам хавтас ч мөн) шалгана уу.`,
  );
} catch (err) {
  console.error('\n✗ Илгээж чадсангүй:', err instanceof Error ? err.message : err);
  process.exit(1);
}
