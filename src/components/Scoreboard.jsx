import { TARGET_SEQUENCE, BULL_INDEX } from '../gameLogic.js';

export default function Scoreboard({ game, onClose }) {
  // Sort players by progress (furthest first)
  const sorted = game.players
    .map((p, i) => ({ ...p, originalIndex: i }))
    .sort((a, b) => b.targetIndex - a.targetIndex);

  const rounds = Math.max(game.round, 1);

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h2>Scoreboard</h2>
        <div className="round-badge">Round {game.round}</div>
        <div className="spacer" />
        {onClose && (
          <button className="btn-secondary" style={{ padding: '0.4rem 0.75rem' }} onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="scoreboard-grid">
        {sorted.map((player, rank) => {
          const isCurrent = player.originalIndex === game.currentPlayerIndex;
          const atBull = player.targetIndex === BULL_INDEX;
          const target = TARGET_SEQUENCE[player.targetIndex];
          const progress = player.targetIndex / BULL_INDEX;
          const marks = player.marks ?? player.targetIndex ?? 0;
          const mpr = (marks / rounds).toFixed(1);
          const isPerfect = player.perfectInRound === game.round || (player.lastIsPerfect && (player.roundCompleted ?? 0) === game.round);

          return (
            <div
              key={player.originalIndex}
              className={`score-row${isCurrent ? ' current-player' : ''}${player.finished ? ' finished' : ''}${isPerfect ? ' is-perfect' : ''}`}
            >
              <div className="score-rank">
                {player.finished ? '🏆' : `${rank + 1}`}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="score-name">{player.name}</span>
                  {isPerfect && (
                    <span className="perfect-badge">✨ PERFECT!</span>
                  )}
                  {isCurrent && !player.finished && (
                    <span style={{ fontSize: '0.72rem', background: 'var(--accent)', color: '#000', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                      NOW
                    </span>
                  )}
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '3.5rem' }}>
                <span className={`score-target${atBull ? ' at-bull' : ''}`}>
                  {player.finished ? '🎯 Bull' : target}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
                  {mpr} MPR
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
