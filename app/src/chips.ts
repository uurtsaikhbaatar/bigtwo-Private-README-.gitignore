/**
 * Виртуал токены форматлалт.
 *
 * Токен нь зөвхөн тоглоомын оноо — бодит мөнгө биш, ямар ч ханшаар
 * солигддоггүй, апп төлбөр тооцоо хийдэггүй.
 */

/** 1000000 → "1 000 000" */
export function groupDigits(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 50000 → "50 000 токен" */
export function formatChips(amount: number): string {
  return `${groupDigits(Math.abs(amount))} токен`;
}

/** Тооцоонд эерэг дүнг "+" тэмдэгтэй харуулна. */
export function formatSignedChips(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatChips(amount)}`;
}

/** Сонголтын товч дээр богино харуулах: 50000 → "50мянга". */
export function shortChips(amount: number): string {
  if (amount === 0) return 'Токенгүй';
  return amount >= 1000 ? `${amount / 1000}мянга` : String(amount);
}
