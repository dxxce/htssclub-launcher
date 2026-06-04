// Tiện ích mã hoá / hiển thị lá bài Tiến Lên.
// card = rankIndex*4 + suitIndex
// rankIndex: 0='3' 1='4' ... 10='K' 11='A' 12='2'
// suitIndex: 0=♠ 1=♣ 2=♦ 3=♥

export const RANK_LABELS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
export const SUIT_LABELS = ["♠", "♣", "♦", "♥"];
// ♠♣ đen, ♦♥ đỏ
export const SUIT_RED = [false, false, true, true];

export function rankOf(card: number): number { return Math.floor(card / 4); }
export function suitOf(card: number): number { return card % 4; }
export function rankLabel(card: number): string { return RANK_LABELS[rankOf(card)] ?? "?"; }
export function suitLabel(card: number): string { return SUIT_LABELS[suitOf(card)] ?? "?"; }
export function isRed(card: number): boolean { return SUIT_RED[suitOf(card)] ?? false; }
export function cardLabel(card: number): string { return `${rankLabel(card)}${suitLabel(card)}`; }

// Sắp xếp tăng dần theo sức mạnh (đúng quy ước backend = so sánh số nguyên).
export function sortCards(cards: number[]): number[] {
  return [...cards].sort((a, b) => a - b);
}
