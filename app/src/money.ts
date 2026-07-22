/**
 * Төгрөгийн форматлалт.
 *
 * `Intl.NumberFormat` нь Hermes дээр үргэлж бүрэн байдаггүй тул гараар
 * бүлэглэнэ — вэб, iOS, Android гурвуулан дээр ижил харагдана.
 */

/** 500000 → "500 000₮" */
export function formatTugrik(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.round(amount)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}₮`;
}

/** Тооцоонд эерэг дүнг "+" тэмдэгтэй харуулна. */
export function formatSigned(amount: number): string {
  return amount > 0 ? `+${formatTugrik(amount)}` : formatTugrik(amount);
}

/** 500000 → "500мянга" — сонголтын товч дээр богино харуулахад. */
export function shortTugrik(amount: number): string {
  if (amount === 0) return 'Байхгүй';
  return `${Math.round(amount / 1000)}мянга`;
}
