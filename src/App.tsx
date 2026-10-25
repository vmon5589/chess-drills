import { lazy, Suspense, useEffect, useState } from 'react';
import { MASTERY, useTrainerProgress } from './lib/progress';

// Each mode (and its puzzle/opening data) loads on demand so the home screen opens fast.
const MatePuzzles = lazy(() => import('./modes/MatePuzzles').then((m) => ({ default: m.MatePuzzles })));
const OpeningQuiz = lazy(() => import('./modes/OpeningQuiz').then((m) => ({ default: m.OpeningQuiz })));
const OpeningTrainer = lazy(() => import('./modes/OpeningTrainer').then((m) => ({ default: m.OpeningTrainer })));

// Hash routes (#/mate, #/trainer/italian, …) keep the phone's back button working with no server config.
function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

const TITLES: Record<string, string> = { mate: 'Mate puzzles', quiz: 'Name that opening', trainer: 'Opening trainer' };

export default function App() {
  const [page, param] = useRoute();
  const title = TITLES[page];

  return (
    <div className="app">
      <header className="topbar">
        {title ? (
          <a className="back" href={page === 'trainer' && param ? '#/trainer' : '#/'} aria-label="Back">
            ‹
          </a>
        ) : null}
        <h1>{title ?? 'Chess Drills'}</h1>
      </header>
      <main>
        <Suspense fallback={<p className="fine">Loading…</p>}>
          {page === 'mate' && <MatePuzzles />}
          {page === 'quiz' && <OpeningQuiz />}
          {page === 'trainer' && <OpeningTrainer lineId={param} />}
        </Suspense>
        {!title && <Home />}
      </main>
    </div>
  );
}

function Home() {
  const [progress] = useTrainerProgress();
  const memorized = Object.values(progress).filter((p) => Math.max(p.w ?? 0, p.b ?? 0) >= MASTERY).length;
  return (
    <div className="home">
      <p className="intro">Short drills, not full games. Pick one and get a few reps in.</p>
      <a className="mode-card" href="#/mate">
        <span className="mode-icon">♛</span>
        <span>
          <strong>Mate puzzles</strong>
          <small>Find checkmate in 2, 3, or 5 moves</small>
        </span>
      </a>
      <a className="mode-card" href="#/quiz">
        <span className="mode-icon">?</span>
        <span>
          <strong>Name that opening</strong>
          <small>Watch the moves, identify the opening</small>
        </span>
      </a>
      <a className="mode-card" href="#/trainer">
        <span className="mode-icon">♞</span>
        <span>
          <strong>Opening trainer</strong>
          <small>
            Drill a line until it sticks{memorized > 0 && ` · ${memorized} memorized`}
          </small>
        </span>
      </a>
      <p className="fine">Puzzles and opening names from the Lichess open database (CC0).</p>
    </div>
  );
}
