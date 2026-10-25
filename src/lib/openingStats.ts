import statsJson from '../data/opening-stats.json';
import { TRAINER_LINES } from './data';
import type { TrainerLine } from './types';

type Band = 'club' | 'strong';
type BandStats = { games: number; score: number | null };
type Stats = {
  source: string;
  totals: Record<Band, { games: number; whiteScore: number }>;
  lines: Record<string, Record<Band, BandStats>>;
};

const STATS = statsJson as Stats;
export const STATS_SOURCE = STATS.source;

/** Fewer games than this and a score is mostly noise, so it isn't shown. */
const MIN_GAMES_FOR_SCORE = 300;

export type LineStats = {
  /** Popularity rank among the trainer openings (1 = most played). */
  rank: Record<Band, number>;
  /** Share of all games in the band that reach this opening's key position. */
  share: Record<Band, number>;
  /** Score (wins + half draws) for the given color, when the sample is big enough. */
  score: Record<Band, number | null>;
  /** Average score for the given color across all games, for comparison. */
  average: Record<Band, number>;
};

const share = (id: string, band: Band) => STATS.lines[id][band].games / STATS.totals[band].games;
const rankings = Object.fromEntries(
  (['club', 'strong'] as Band[]).map((b) => [
    b,
    new Map([...TRAINER_LINES].sort((x, y) => share(y.id, b) - share(x.id, b)).map((l, i) => [l.id, i + 1])),
  ]),
) as Record<Band, Map<string, number>>;
export const OPENING_COUNT = TRAINER_LINES.length;

export function statsFor(line: TrainerLine, color: 'w' | 'b' = line.side): LineStats {
  const bands: Band[] = ['club', 'strong'];
  const per = <T,>(fn: (b: Band) => T) => Object.fromEntries(bands.map((b) => [b, fn(b)])) as Record<Band, T>;
  return {
    rank: per((b) => rankings[b].get(line.id)!),
    share: per((b) => share(line.id, b)),
    score: per((b) => {
      const s = STATS.lines[line.id][b];
      if (s.score === null || s.games < MIN_GAMES_FOR_SCORE) return null;
      return color === line.side ? s.score : 1 - s.score;
    }),
    average: per((b) => (color === 'w' ? STATS.totals[b].whiteScore : 1 - STATS.totals[b].whiteScore)),
  };
}

/** 0.0484 → "1 in 21", 0.0002 → "1 in 5.4k" */
export function frequency(share: number) {
  if (share <= 0) return 'rare';
  const n = Math.round(1 / share);
  return `1 in ${n >= 1000 ? `${Math.round(n / 100) / 10}k` : n}`;
}

export const percent = (score: number) => `${Math.round(score * 100)}%`;
