// Builds src/data/opening-stats.json: how often each trainer opening is played and how it scores,
// measured on a slice of the Lichess rated-games database (CC0).
// Usage: node scripts/build-stats.mjs   (run build-data.mjs first; requires curl and zstd on PATH)
import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const MONTH = '2026-09';
const BYTES = 300_000_000; // first ~300MB of the month's archive, roughly 1M+ games
const CACHE = new URL('./.cache/', import.meta.url).pathname;
const OUT = new URL('../src/data/', import.meta.url).pathname;
const ARCHIVE = `${CACHE}games-${MONTH}.part.zst`;

if (!existsSync(ARCHIVE)) {
  const url = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`;
  execSync(`curl -s -r 0-${BYTES} -o "${ARCHIVE}" ${url}`, { stdio: 'inherit' });
}

const { trainer } = JSON.parse(readFileSync(OUT + 'openings.json', 'utf8'));

const BANDS = {
  club: (elo) => elo >= 1200 && elo < 2000,
  strong: (elo) => elo >= 2200,
};

// A game matches a line if, after the line's key ply, each side has played the same set of moves.
// That catches transpositions (e.g. 1.d4 e6 2.c4 Nf6 3.Nc3 Bb4 still counts as a Nimzo-Indian).
const strip = (san) => san.replace(/[+#?!]/g, '');
const signature = (moves) => {
  const w = moves.filter((_, i) => i % 2 === 0).map(strip).sort();
  const b = moves.filter((_, i) => i % 2 === 1).map(strip).sort();
  return `${w.join(' ')}|${b.join(' ')}`;
};
const lines = trainer.map((l) => ({ id: l.id, side: l.side, key: l.keyPly, sig: signature(l.moves.slice(0, l.keyPly)) }));
const maxKey = Math.max(...lines.map((l) => l.key));

const empty = () => ({ games: 0, white: 0, draws: 0, black: 0 });
const totals = Object.fromEntries(Object.keys(BANDS).map((b) => [b, empty()]));
const counts = Object.fromEntries(lines.map((l) => [l.id, Object.fromEntries(Object.keys(BANDS).map((b) => [b, empty()]))]));

function tally(t, result) {
  t.games++;
  if (result === '1-0') t.white++;
  else if (result === '0-1') t.black++;
  else t.draws++;
}

let headers = {};
let scanned = 0;
const zstd = spawn('zstd', ['-dc', ARCHIVE], { stdio: ['ignore', 'pipe', 'ignore'] });
for await (const line of createInterface({ input: zstd.stdout, crlfDelay: Infinity })) {
  if (line.startsWith('[')) {
    const m = line.match(/^\[(\w+) "(.*)"\]$/);
    if (m) headers[m[1]] = m[2];
    continue;
  }
  if (!line.startsWith('1.')) continue;
  const h = headers;
  headers = {};
  scanned++;
  if (!h.Result || h.Result === '*' || /Bullet/.test(h.Event ?? '')) continue;
  const elo = (+h.WhiteElo + +h.BlackElo) / 2;
  const band = Object.keys(BANDS).find((b) => BANDS[b](elo));
  if (!band) continue;

  tally(totals[band], h.Result);
  const moves = line
    .replace(/\{[^}]*\}/g, '')
    .replace(/\d+\.+/g, '')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
    .slice(0, maxKey);
  const sigs = new Map();
  for (const l of lines) {
    if (moves.length < l.key) continue;
    if (!sigs.has(l.key)) sigs.set(l.key, signature(moves.slice(0, l.key)));
    if (sigs.get(l.key) === l.sig) tally(counts[l.id][band], h.Result);
  }
}

const summarize = (t, side) => ({
  games: t.games,
  // Score for the side the line is studied from: wins + half the draws.
  score: t.games ? +(((side === 'w' ? t.white : t.black) + t.draws / 2) / t.games).toFixed(3) : null,
});
const stats = {
  source: `Lichess rated games, ${MONTH} (sample), blitz and slower`,
  totals: Object.fromEntries(Object.entries(totals).map(([b, t]) => [b, { games: t.games, whiteScore: +((t.white + t.draws / 2) / t.games).toFixed(3) }])),
  lines: Object.fromEntries(
    lines.map((l) => [l.id, Object.fromEntries(Object.keys(BANDS).map((b) => [b, summarize(counts[l.id][b], l.side)]))]),
  ),
};
writeFileSync(OUT + 'opening-stats.json', JSON.stringify(stats, null, 1));

console.log(`scanned ${scanned} games`, stats.totals);
const pct = (n, d) => ((100 * n) / d).toFixed(2).padStart(6) + '%';
for (const l of lines) {
  const s = stats.lines[l.id];
  console.log(
    l.id.padEnd(16),
    'club', pct(s.club.games, totals.club.games), 'score', s.club.score,
    '| strong', pct(s.strong.games, totals.strong.games), 'score', s.strong.score, `(n=${s.strong.games})`,
  );
}
