import { useMemo, useState, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';

export type BoardArrow = { startSquare: string; endSquare: string; color: string };

type Props = {
  fen: string;
  orientation: 'white' | 'black';
  /** Called when the user attempts a legal move. Return true to accept it. */
  onMove?: (from: string, to: string) => boolean;
  interactive?: boolean;
  lastMove?: [string, string] | null;
  /** Extra square styles, e.g. hint or error flashes. */
  marks?: Record<string, CSSProperties>;
  arrows?: BoardArrow[];
};

const LAST_MOVE = { background: 'var(--last-move)' };
const SELECTED = { background: 'var(--selected)' };
const TARGET = { background: 'radial-gradient(circle, var(--target) 24%, transparent 26%)' };
const CAPTURE = { background: 'radial-gradient(circle, transparent 62%, var(--target) 64%)' };

export function Board({ fen, orientation, onMove, interactive = true, lastMove, marks, arrows }: Props) {
  // Tap-to-move: remember the selected square, keyed by position so it resets when the fen changes.
  const [selection, setSelection] = useState<{ fen: string; square: Square } | null>(null);
  const selected = selection?.fen === fen ? selection.square : null;
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();

  const targets = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected],
  );

  const attempt = (from: string, to: string) => {
    setSelection(null);
    const legal = chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to);
    return legal && interactive && onMove ? onMove(from, to) : false;
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (!interactive) return;
    if (selected && targets.some((m) => m.to === square)) {
      attempt(selected, square);
      return;
    }
    const piece = chess.get(square as Square);
    setSelection(piece && piece.color === turn && square !== selected ? { fen, square: square as Square } : null);
  };

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) for (const s of lastMove) squareStyles[s] = LAST_MOVE;
  if (selected) squareStyles[selected] = SELECTED;
  for (const m of targets) squareStyles[m.to] = m.captured ? CAPTURE : TARGET;
  Object.assign(squareStyles, marks);

  return (
    <div className="board">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          squareStyles,
          arrows: arrows ?? [],
          allowDrawingArrows: false,
          allowDragging: interactive,
          animationDurationInMs: 250,
          darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
          lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
          canDragPiece: ({ piece }) => interactive && piece.pieceType[0] === turn,
          onPieceDrag: ({ square }) => square && setSelection({ fen, square: square as Square }),
          onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && attempt(sourceSquare, targetSquare),
          onSquareClick,
        }}
      />
    </div>
  );
}
