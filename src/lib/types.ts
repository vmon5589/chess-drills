export type Puzzle = { id: string; fen: string; moves: string[]; rating: number };
export type MateDepth = 2 | 3 | 5;

export type TrainerLine = {
  id: string;
  title: string;
  side: 'w' | 'b';
  eco: string;
  name: string;
  family: string;
  moves: string[];
  /** Ply at which the line gets its name; stats are measured there. */
  keyPly: number;
};

export type QuizLine = { eco: string; name: string; moves: string[] };
