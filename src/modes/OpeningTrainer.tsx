import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Chess, DEFAULT_POSITION as START_FEN } from 'chess.js';
import { Board, type BoardArrow } from '../components/Board';
import { TRAINER_LINES } from '../lib/data';
import { playUserMove } from '../lib/chess';
import { MASTERY, useTrainerProgress } from '../lib/progress';
import type { TrainerLine } from '../lib/types';

// SVG arrows take a literal color; CSS variables don't apply there.
const ARROW_COLOR = '#2f9e44';

type Color = 'w' | 'b';
type Mode = 'learn' | 'practice';

const GROUPS: { title: string; test: (l: TrainerLine) => boolean }[] = [
  { title: '1. e4', test: (l) => l.moves[0] === 'e4' },
  { title: '1. d4', test: (l) => l.moves[0] === 'd4' },
  { title: 'Other first moves', test: (l) => l.moves[0] !== 'e4' && l.moves[0] !== 'd4' },
];

export function OpeningTrainer({ lineId }: { lineId?: string }) {
  const line = TRAINER_LINES.find((l) => l.id === lineId);
  return line ? <Drill key={line.id} line={line} /> : <LinePicker />;
}

function LinePicker() {
  const [progress] = useTrainerProgress();
  return (
    <div className="picker">
      <p className="intro">
        Pick an opening and play your side until the moves are automatic. Each clean run counts toward memorizing it.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <div className="line-grid">
            {TRAINER_LINES.filter(g.test).map((l) => {
              const runs = progress[l.id]?.[l.side] ?? 0;
              return (
                <a key={l.id} className="line-card" href={`#/trainer/${l.id}`}>
                  <span className="line-title">{l.title}</span>
                  <span className="line-meta">
                    {l.eco} · play as {l.side === 'w' ? 'White' : 'Black'} · {Math.ceil(l.moves.length / 2)} moves
                  </span>
                  <Meter value={runs} />
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="meter" aria-label={`${Math.min(value, MASTERY)} of ${MASTERY} clean runs`}>
      {Array.from({ length: MASTERY }, (_, i) => (
        <span key={i} className={i < value ? 'on' : ''} />
      ))}
      {value >= MASTERY && <span className="mastered">Memorized</span>}
    </span>
  );
}

function Drill({ line }: { line: TrainerLine }) {
  const [progress, setProgress] = useTrainerProgress();
  const [color, setColor] = useState<Color>(line.side);
  const runs = progress[line.id]?.[color] ?? 0;
  // New lines start in learn mode (moves shown); once you've had a clean run, default to practice.
  const [mode, setMode] = useState<Mode>(runs > 0 ? 'practice' : 'learn');

  const chess = useRef(new Chess());
  const [fen, setFen] = useState(START_FEN);
  const [ply, setPly] = useState(0);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [marks, setMarks] = useState<Record<string, CSSProperties>>({});
  const [mistakes, setMistakes] = useState(0);
  const [missesHere, setMissesHere] = useState(0);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(0); // bumping this restarts the line
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const done = ply >= line.moves.length;
  const yourTurn = !done && (ply % 2 === 0 ? 'w' : 'b') === color;

  const expectedMove = () => (done ? null : new Chess(fen).move(line.moves[ply]));

  // Advance to the next ply; a clean practice run is recorded when the line ends.
  const advance = () => {
    const next = ply + 1;
    setPly(next);
    if (next === line.moves.length && mode === 'practice' && mistakes === 0) {
      setProgress((p) => ({ ...p, [line.id]: { ...p[line.id], [color]: (p[line.id]?.[color] ?? 0) + 1 } }));
    }
  };

  // Reset the board whenever a new run starts.
  useEffect(() => {
    chess.current = new Chess();
    setFen(chess.current.fen());
    setPly(0);
    setLastMove(null);
    setMarks({});
    setMistakes(0);
    setMissesHere(0);
    setBusy(false);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [run, color]);

  // Play the opponent's book reply. Runs after every render (no deps) so `advance` sees fresh state;
  // the timer is cleared on re-render, and it is a no-op unless it is the opponent's turn.
  useEffect(() => {
    if (done || yourTurn) return;
    const id = window.setTimeout(() => {
      const m = chess.current.move(line.moves[ply]);
      setFen(chess.current.fen());
      setLastMove([m.from, m.to]);
      advance();
    }, ply === 0 ? 600 : 450);
    return () => clearTimeout(id);
  });

  const onMove = (from: string, to: string) => {
    if (!yourTurn || busy) return false;
    const expected = expectedMove()!;
    const move = playUserMove(chess.current, from, to, expected.from + expected.to + (expected.promotion ?? ''));
    if (!move) return false;
    setFen(chess.current.fen());
    setLastMove([move.from, move.to]);

    if (move.san === expected.san) {
      setMarks({});
      setMissesHere(0);
      advance();
      return true;
    }

    setBusy(true);
    setMistakes((n) => n + 1);
    setMissesHere((n) => n + 1);
    setMarks({ [to]: { background: 'var(--wrong)' } });
    later(() => {
      chess.current.undo();
      const prev = chess.current.history({ verbose: true }).at(-1);
      setFen(chess.current.fen());
      setLastMove(prev ? [prev.from, prev.to] : null);
      setMarks({});
      setBusy(false);
    }, 700);
    return true;
  };

  // Learn mode always shows the move; practice mode shows it after two misses on the same move.
  const expected = yourTurn && !busy ? expectedMove() : null;
  const showArrow = expected && (mode === 'learn' || missesHere >= 2);
  const arrows: BoardArrow[] = showArrow ? [{ startSquare: expected.from, endSquare: expected.to, color: ARROW_COLOR }] : [];

  const restart = () => setRun((r) => r + 1);

  let message: string;
  if (done) {
    message =
      mode === 'learn'
        ? 'Line complete. Switch to Practice to test yourself.'
        : mistakes === 0
          ? `Clean run! ${Math.min(runs, MASTERY)}/${MASTERY} toward memorized.`
          : `Line complete with ${mistakes} mistake${mistakes === 1 ? '' : 's'}. Go again.`;
  } else if (busy) message = 'Not the book move.';
  else if (yourTurn) message = mode === 'learn' ? 'Play the move shown.' : missesHere >= 2 ? 'Here it is:' : 'Your move.';
  else message = 'Opponent is moving…';

  return (
    <div className="play-layout">
      <Board
        fen={fen}
        orientation={color === 'w' ? 'white' : 'black'}
        onMove={onMove}
        interactive={yourTurn && !busy}
        lastMove={lastMove}
        marks={marks}
        arrows={arrows}
      />
      <div className="panel">
        <h2 className="drill-title">{line.title}</h2>
        <p className="fine">
          {line.eco} · {line.name}
        </p>

        <div className="segmented" role="tablist" aria-label="Mode">
          {(['learn', 'practice'] as Mode[]).map((m) => (
            <button
              key={m}
              className={m === mode ? 'active' : ''}
              onClick={() => {
                setMode(m);
                restart();
              }}
            >
              {m === 'learn' ? 'Learn' : 'Practice'}
            </button>
          ))}
        </div>
        <div className="segmented small" role="tablist" aria-label="Your color">
          {(['w', 'b'] as Color[]).map((c) => (
            <button key={c} className={c === color ? 'active' : ''} onClick={() => setColor(c)}>
              Play {c === 'w' ? 'White' : 'Black'}
            </button>
          ))}
        </div>

        <p className={`status ${done && mistakes === 0 && mode === 'practice' ? 'status-solved' : ''} ${busy ? 'status-wrong' : ''}`}>
          {message}
        </p>

        <ol className="line-moves">
          {line.moves.map((san, i) => (
            <li key={i} className={i < ply ? 'played' : i === ply ? 'current' : ''}>
              {i % 2 === 0 && <span className="num">{i / 2 + 1}.</span>}
              {i < ply || mode === 'learn' ? san : '?'}
            </li>
          ))}
        </ol>

        <div className="actions">
          <button className={done ? 'primary' : ''} onClick={restart}>
            {done ? 'Run it again' : 'Restart'}
          </button>
          <a className="button" href="#/trainer">
            All openings
          </a>
        </div>

        <Meter value={runs} />
      </div>
    </div>
  );
}
