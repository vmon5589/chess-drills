import { Chess, type Move } from 'chess.js';

export type UciMove = string;

export const toUci = (m: Pick<Move, 'from' | 'to' | 'promotion'>) => m.from + m.to + (m.promotion ?? '');

/** Plays a move given as UCI (e2e4, e7e8q). Returns null if illegal. */
export function playUci(chess: Chess, uci: UciMove): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/**
 * Plays a move the user made by dragging/tapping. Promotions default to the expected
 * piece when the user's from/to matches it, otherwise to a queen.
 */
export function playUserMove(chess: Chess, from: string, to: string, expected?: UciMove): Move | null {
  const promotion = expected && expected.startsWith(from + to) && expected[4] ? expected[4] : 'q';
  try {
    return chess.move({ from, to, promotion });
  } catch {
    return null;
  }
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Formats SAN moves as "1. e4 e5 2. Nf3". */
export function formatMoves(san: string[]): string {
  return san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
}
