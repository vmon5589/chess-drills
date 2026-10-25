import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import { QUIZ_LINES, TRAINER_LINES, familyOf } from '../lib/data';
import { formatMoves, shuffle } from '../lib/chess';
import { usePersistentState } from '../lib/storage';
import type { QuizLine } from '../lib/types';

type Level = 'family' | 'variation';
type Question = { line: QuizLine; answer: string; options: string[] };
type Stats = { correct: number; total: number; streak: number; best: number };

const STEP_MS = 600;
const BY_FAMILY = QUIZ_LINES.reduce<Record<string, QuizLine[]>>((acc, line) => {
  (acc[familyOf(line.name)] ??= []).push(line);
  return acc;
}, {});
const FAMILIES = Object.keys(BY_FAMILY);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function makeQuestion(level: Level): Question {
  if (level === 'family') {
    // Choose the family first so big families (the Sicilian has hundreds of lines) don't dominate.
    const family = pick(FAMILIES);
    const others = shuffle(FAMILIES.filter((f) => f !== family)).slice(0, 3);
    return { line: pick(BY_FAMILY[family]), answer: family, options: shuffle([family, ...others]) };
  }
  const variations = (f: string) => BY_FAMILY[f].filter((l) => l.name.includes(':'));
  const family = pick(FAMILIES.filter((f) => new Set(variations(f).map((l) => l.name)).size >= 4));
  const line = pick(variations(family));
  const others = shuffle([...new Set(variations(family).map((l) => l.name))].filter((n) => n !== line.name)).slice(0, 3);
  return { line, answer: line.name, options: shuffle([line.name, ...others]) };
}

/** Variation names repeat the family, so drop it from the button label. */
const label = (name: string, level: Level) => (level === 'variation' ? name.split(': ')[1] ?? name : name);

export function OpeningQuiz() {
  const [level, setLevel] = usePersistentState<Level>('quiz.level', 'family');
  const [allStats, setAllStats] = usePersistentState<Record<string, Stats>>('quiz.stats', {});
  const stats = allStats[level] ?? { correct: 0, total: 0, streak: 0, best: 0 };
  const [question, setQuestion] = useState(() => makeQuestion(level));
  const [shown, setShown] = useState(0); // number of moves played on the board so far
  const [replayKey, setReplayKey] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  const { line } = question;
  const positions = useMemo(() => {
    const c = new Chess();
    const out = [{ fen: c.fen(), last: null as [string, string] | null }];
    for (const san of line.moves) {
      const m = c.move(san);
      out.push({ fen: c.fen(), last: [m.from, m.to] });
    }
    return out;
  }, [line]);

  // Play the line out move by move.
  useEffect(() => {
    setShown(0);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= line.moves.length) clearInterval(timer.current);
    }, STEP_MS);
    return () => clearInterval(timer.current);
  }, [line, replayKey]);

  const next = (lvl = level) => {
    setChosen(null);
    setQuestion(makeQuestion(lvl));
  };

  const answer = (option: string) => {
    if (chosen) return;
    setChosen(option);
    clearInterval(timer.current);
    setShown(line.moves.length);
    const right = option === question.answer;
    setAllStats((all) => {
      const s = all[level] ?? stats;
      const streak = right ? s.streak + 1 : 0;
      return {
        ...all,
        [level]: { correct: s.correct + (right ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) },
      };
    });
  };

  // Link to the closest trainer line: same variation if we have one, otherwise same family.
  const variation = line.name.split(',')[0];
  const trainerMatch =
    TRAINER_LINES.find((t) => t.name.startsWith(variation) && line.name.includes(':')) ??
    TRAINER_LINES.find((t) => t.family === familyOf(line.name));
  const position = positions[shown];

  return (
    <div className="play-layout">
      <Board fen={position.fen} orientation="white" interactive={false} lastMove={position.last} />
      <div className="panel">
        <div className="segmented" role="tablist" aria-label="Quiz level">
          {(['family', 'variation'] as Level[]).map((l) => (
            <button
              key={l}
              className={l === level ? 'active' : ''}
              onClick={() => {
                setLevel(l);
                next(l);
              }}
            >
              {l === 'family' ? 'Opening' : 'Variation'}
            </button>
          ))}
        </div>

        <p className="status">
          {level === 'family' ? 'Which opening is this?' : `Which ${question.answer.split(':')[0]} line is this?`}
        </p>
        <p className="movelist">{formatMoves(line.moves.slice(0, shown)) || '…'}</p>

        <div className="options">
          {question.options.map((o) => {
            const state = !chosen ? '' : o === question.answer ? 'correct' : o === chosen ? 'incorrect' : 'dim';
            return (
              <button key={o} className={`option ${state}`} onClick={() => answer(o)} disabled={!!chosen}>
                {label(o, level)}
              </button>
            );
          })}
        </div>

        {chosen && (
          <div className="reveal">
            <p>
              <strong>{line.eco}</strong> {line.name}
            </p>
            <div className="actions">
              <button className="primary" onClick={() => next()}>
                Next
              </button>
              <button onClick={() => setReplayKey((k) => k + 1)}>Replay</button>
              {trainerMatch && <a className="button" href={`#/trainer/${trainerMatch.id}`}>Practice it</a>}
            </div>
          </div>
        )}

        <dl className="stats">
          <div>
            <dt>Correct</dt>
            <dd>
              {stats.correct}/{stats.total}
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{stats.streak}</dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{stats.best}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
