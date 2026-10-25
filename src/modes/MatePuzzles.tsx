import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import puzzlesJson from '../data/puzzles.json';
import { playUci, playUserMove, toUci } from '../lib/chess';
import { usePersistentState } from '../lib/storage';
import type { MateDepth, Puzzle } from '../lib/types';

type Difficulty = 'easy' | 'medium' | 'hard';
type Status = 'setup' | 'yourMove' | 'opponent' | 'wrong' | 'solved' | 'revealed';
type Stats = { solved: number; attempted: number; streak: number; best: number };

const PUZZLES = puzzlesJson as unknown as Record<MateDepth, Puzzle[]>;
const DEPTHS: MateDepth[] = [2, 3, 5];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const EMPTY_STATS: Stats = { solved: 0, attempted: 0, streak: 0, best: 0 };
const DELAY = 550;

/** Puzzles are stored sorted by rating, so difficulty is a third of the list. */
function poolFor(depth: MateDepth, difficulty: Difficulty): Puzzle[] {
  const all = PUZZLES[depth];
  const third = Math.ceil(all.length / 3);
  const i = DIFFICULTIES.indexOf(difficulty);
  return all.slice(i * third, (i + 1) * third);
}

function pickPuzzle(pool: Puzzle[], solved: string[], currentId?: string): Puzzle {
  const fresh = pool.filter((p) => !solved.includes(p.id) && p.id !== currentId);
  const candidates = fresh.length ? fresh : pool.filter((p) => p.id !== currentId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function MatePuzzles() {
  const [depth, setDepth] = usePersistentState<MateDepth>('mate.depth', 2);
  const [difficulty, setDifficulty] = usePersistentState<Difficulty>('mate.difficulty', 'easy');
  const [allStats, setAllStats] = usePersistentState<Record<string, Stats>>('mate.stats', {});
  const [solvedIds, setSolvedIds] = usePersistentState<string[]>('mate.solved', []);
  const stats = allStats[depth] ?? EMPTY_STATS;

  const [puzzle, setPuzzle] = useState(() => pickPuzzle(poolFor(depth, difficulty), solvedIds));
  const chess = useRef(new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [ply, setPly] = useState(0);
  const [status, setStatus] = useState<Status>('setup');
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [marks, setMarks] = useState<Record<string, CSSProperties>>({});
  const [assisted, setAssisted] = useState(false);
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms = DELAY) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const sync = (move: { from: string; to: string } | null) => {
    setFen(chess.current.fen());
    if (move) setLastMove([move.from, move.to]);
  };

  const updateStats = useCallback(
    (fn: (s: Stats) => Stats) => setAllStats((all) => ({ ...all, [depth]: fn(all[depth] ?? EMPTY_STATS) })),
    [depth, setAllStats],
  );

  // Start a puzzle: show the position, then play the opponent's setup move.
  useEffect(() => {
    clearTimers();
    chess.current = new Chess(puzzle.fen);
    setFen(puzzle.fen);
    setLastMove(null);
    setMarks({});
    setAssisted(false);
    setPly(0);
    setStatus('setup');
    later(() => {
      sync(playUci(chess.current, puzzle.moves[0]));
      setPly(1);
      setStatus('yourMove');
    }, 700);
    return clearTimers;
  }, [puzzle]);

  const nextPuzzle = (d = depth, diff = difficulty) => setPuzzle(pickPuzzle(poolFor(d, diff), solvedIds, puzzle.id));

  const breakStreak = () => {
    if (!assisted) updateStats((s) => ({ ...s, attempted: s.attempted + 1, streak: 0 }));
    setAssisted(true);
  };

  const onMove = (from: string, to: string) => {
    if (status !== 'yourMove') return false;
    const expected = puzzle.moves[ply];
    const move = playUserMove(chess.current, from, to, expected);
    if (!move) return false;
    sync(move);
    setMarks({});

    // Any move that mates is correct, even if it differs from the stored solution.
    if (chess.current.isCheckmate()) {
      setStatus('solved');
      if (!assisted) {
        updateStats((s) => ({
          solved: s.solved + 1,
          attempted: s.attempted + 1,
          streak: s.streak + 1,
          best: Math.max(s.best, s.streak + 1),
        }));
        setSolvedIds((ids) => (ids.includes(puzzle.id) ? ids : [...ids, puzzle.id]));
      }
      return true;
    }

    if (toUci(move) === expected) {
      setStatus('opponent');
      later(() => {
        sync(playUci(chess.current, puzzle.moves[ply + 1]));
        setPly(ply + 2);
        setStatus('yourMove');
      });
      return true;
    }

    setStatus('wrong');
    setMarks({ [to]: { background: 'var(--wrong)' } });
    breakStreak();
    later(() => {
      chess.current.undo();
      const prev = chess.current.history({ verbose: true }).at(-1);
      sync(prev ?? null);
      setMarks({});
      setStatus('yourMove');
    }, 800);
    return true;
  };

  const showHint = () => {
    breakStreak();
    setMarks({ [puzzle.moves[ply].slice(0, 2)]: { background: 'var(--hint)' } });
  };

  const revealSolution = () => {
    breakStreak();
    clearTimers();
    setStatus('revealed');
    setMarks({});
    puzzle.moves.slice(ply).forEach((m, i) => later(() => sync(playUci(chess.current, m)), (i + 1) * 700));
  };

  // The solver is the side that moves after the setup move, i.e. not the side to move in the FEN.
  const solverIsWhite = puzzle.fen.split(' ')[1] === 'b';
  const movesLeft = Math.ceil((puzzle.moves.length - ply) / 2);

  let message: string;
  if (status === 'setup') message = 'Watch the last move…';
  else if (status === 'solved') message = assisted ? 'Checkmate! (with help)' : 'Checkmate! Well done.';
  else if (status === 'revealed') message = 'Here is the solution.';
  else if (status === 'wrong') message = 'Not that one, try again.';
  else if (status === 'opponent') message = 'Good move…';
  else message = `${solverIsWhite ? 'White' : 'Black'} to move: mate in ${movesLeft}`;

  const done = status === 'solved' || status === 'revealed';

  return (
    <div className="play-layout">
      <Board
        fen={fen}
        orientation={solverIsWhite ? 'white' : 'black'}
        onMove={onMove}
        interactive={status === 'yourMove'}
        lastMove={lastMove}
        marks={marks}
      />
      <div className="panel">
        <div className="segmented" role="tablist" aria-label="Mate depth">
          {DEPTHS.map((d) => (
            <button
              key={d}
              className={d === depth ? 'active' : ''}
              onClick={() => {
                setDepth(d);
                nextPuzzle(d, difficulty);
              }}
            >
              Mate in {d}
            </button>
          ))}
        </div>
        <div className="segmented small" role="tablist" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={d === difficulty ? 'active' : ''}
              onClick={() => {
                setDifficulty(d);
                nextPuzzle(depth, d);
              }}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <p className={`status status-${status}`}>{message}</p>

        <div className="actions">
          {done ? (
            <button className="primary" onClick={() => nextPuzzle()}>
              Next puzzle
            </button>
          ) : (
            <>
              <button onClick={showHint} disabled={status !== 'yourMove'}>
                Hint
              </button>
              <button onClick={revealSolution} disabled={status === 'setup'}>
                Show solution
              </button>
              <button onClick={() => nextPuzzle()}>Skip</button>
            </>
          )}
        </div>

        <dl className="stats">
          <div>
            <dt>Solved</dt>
            <dd>{stats.solved}</dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{stats.streak}</dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{stats.best}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd>{puzzle.rating}</dd>
          </div>
        </dl>
        <p className="fine">
          Puzzle from{' '}
          <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
            Lichess #{puzzle.id}
          </a>
        </p>
      </div>
    </div>
  );
}
