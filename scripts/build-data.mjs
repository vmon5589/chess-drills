// Builds src/data/puzzles.json and src/data/openings.json from Lichess CC0 datasets.
// Usage: node scripts/build-data.mjs   (requires curl and zstd on PATH)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { LINES } from './openings-source.mjs';

const CACHE = new URL('./.cache/', import.meta.url).pathname;
const OUT = new URL('../src/data/', import.meta.url).pathname;
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

function fetchOnce(file, cmd) {
  if (!existsSync(CACHE + file)) execSync(cmd, { cwd: CACHE, stdio: 'inherit', shell: '/bin/sh' });
  return readFileSync(CACHE + file, 'utf8');
}

// ---------- Puzzles ----------
// Only the first ~40MB of the 300MB archive is needed; zstd decodes the prefix fine.
const csv = fetchOnce(
  'puzzles.csv',
  'curl -s -r 0-40000000 -o part.zst https://database.lichess.org/lichess_db_puzzle.csv.zst; zstd -dc part.zst > puzzles.csv 2>/dev/null; true',
);
const PER_THEME = 300;
const buckets = { 2: [], 3: [], 5: [] };
for (const line of csv.split('\n').slice(1)) {
  const [id, fen, moves, rating, , popularity, plays, themes] = line.split(',');
  if (!themes) continue;
  const n = [2, 3, 5].find((k) => themes.split(' ').includes(`mateIn${k}`));
  if (!n || +popularity < 80 || +plays < 300) continue;
  // Moves[0] is the opponent's setup move; the solver then has n moves.
  const uci = moves.split(' ');
  if (uci.length !== 2 * n) continue;
  const chess = new Chess(fen);
  try {
    for (const m of uci) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  } catch {
    continue;
  }
  if (!chess.isCheckmate()) continue;
  buckets[n].push({ id, fen, moves: uci, rating: +rating });
}
const puzzles = {};
for (const [n, list] of Object.entries(buckets)) {
  // Spread picks evenly across the rating range so every difficulty is represented.
  list.sort((a, b) => a.rating - b.rating);
  const step = Math.max(1, list.length / PER_THEME);
  puzzles[n] = Array.from({ length: Math.min(PER_THEME, list.length) }, (_, i) => list[Math.floor(i * step)]);
  console.log(`mate in ${n}: ${puzzles[n].length} puzzles (from ${list.length})`);
}
writeFileSync(OUT + 'puzzles.json', JSON.stringify(puzzles));

// ---------- Openings ----------
const tsv = ['a', 'b', 'c', 'd', 'e']
  .map((f) =>
    fetchOnce(`${f}.tsv`, `curl -s -o ${f}.tsv https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}.tsv`),
  )
  .join('\n');
const epd = (c) => c.fen().split(' ').slice(0, 4).join(' ');
const sanList = (pgn) => pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t));
const byPosition = new Map();
const entries = [];
for (const row of tsv.split('\n')) {
  const [eco, name, pgn] = row.split('\t');
  if (!pgn || eco === 'eco') continue;
  const c = new Chess();
  const moves = sanList(pgn);
  for (const m of moves) c.move(m);
  byPosition.set(epd(c), { eco, name });
  entries.push({ eco, name, moves: c.history() });
}

const trainer = LINES.map(({ id, title, side, moves }) => {
  const c = new Chess();
  let match = null;
  for (const m of moves.split(' ')) {
    c.move(m); // throws on an illegal move, which is what we want
    match = byPosition.get(epd(c)) ?? match;
  }
  if (!match) throw new Error(`No named opening found for ${id}`);
  console.log(`${id.padEnd(16)} ${match.eco} ${match.name}`);
  return { id, title, side, eco: match.eco, name: match.name, family: match.name.split(':')[0], moves: c.history() };
});

// Quiz pool: dataset lines from the same families as the trainer, short enough to recognise.
// "Queen's Pawn Game" is a catch-all rather than an opening you can identify, so it is left out,
// as are deep sub-variations (names with a comma), which are mostly obscure.
const families = new Set(trainer.map((t) => t.family).filter((f) => f !== "Queen's Pawn Game"));
const quiz = entries
  .filter((e) => families.has(e.name.split(':')[0]) && !e.name.includes(',') && e.moves.length >= 4 && e.moves.length <= 16)
  .map((e) => ({ eco: e.eco, name: e.name, moves: e.moves }));
console.log(`quiz pool: ${quiz.length} lines across ${families.size} families`);
writeFileSync(OUT + 'openings.json', JSON.stringify({ trainer, quiz }));
