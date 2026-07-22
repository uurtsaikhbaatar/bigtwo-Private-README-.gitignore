/**
 * Виртуал чипийн форматлалт.
 *
 * Чип нь зөвхөн тоглоомын оноо — бодит мөнгө биш, апп ямар ч төлбөр
 * тооцоо хийдэггүй.
 */

/** 100 → "100 чип" */
export function formatChips(amount: number): string {
  return `${Math.abs(Math.round(amount))} чип`;
}

/** Тооцоонд эерэг дүнг "+" тэмдэгтэй харуулна. */
export function formatSignedChips(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatChips(amount)}`;
}

/** Сонголтын товч дээр богино харуулах. */
export function shortChips(amount: number): string {
  return amount === 0 ? 'Чипгүй' : String(amount);
}
