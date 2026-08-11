import { useState } from 'react';

/**
 * Playoff screen.
 *
 * Each playoff player throws at the chosen playoff number.
 *   Score is number of hits (single=1, double=2, triple=3).
 *   Perfect throw (all 3 hit) gives 3 bonus darts.
 */

export default function PlayoffScreen({ game, playoffPlayers, playoffNumber, onPlayoffComplete, onPlayoffTie }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({}); // playerIndex -> total hits
  const [darts, setDarts] = useState([]);

  function handleDart(type) {
    if (darts.length >= 3) return;
    const newDarts = [...darts, type];
    setDarts(newDarts);

    if (newDarts.length === 3) {
      const hitCount = newDarts.reduce((acc, d) => {
        if (d === 'miss') return acc;
        return acc + (d === 'single' ? 1 : d === 'double' ? 2 : 3);
      }, 0);

      const playerIdx = playoffPlayers[currentIdx];
      const prevScore = scores[playerIdx] || 0;
      const finalScore = prevScore + hitCount;
      const newScores = { ...scores, [playerIdx]: finalScore };
      setScores(newScores);
      advancePlayer(newScores);
    }
  }

  function advancePlayer(newScores) {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= playoffPlayers.length) {
      // All playoff players done (1 round complete) – find winner(s)
      const maxScore = Math.max(...Object.values(newScores));
      const winners = playoffPlayers.filter(pi => (newScores[pi] || 0) === maxScore);
      if (winners.length > 1 && typeof onPlayoffTie === 'function') {
        onPlayoffTie(winners);
      } else {
        onPlayoffComplete(winners, newScores);
      }
    } else {
      setCurrentIdx(nextIdx);
      setDarts([]);
    }
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  const playerIdx = playoffPlayers[currentIdx];
  const playerName = game.players[playerIdx].name;
  const setDone = darts.length === 3;
  const currentScore = scores[playerIdx] || 0;
  const playoffNames = playoffPlayers.map(pi => game.players[pi].name).join(', ');

  const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };
  const DART_OPTIONS = [
    { key: 'miss',   label: 'Miss',   sub: '0',   cls: 'btn-miss' },
    { key: 'single', label: 'Hit',    sub: '+1',  cls: 'btn-single' },
    { key: 'double', label: 'Double', sub: '+2',  cls: 'btn-double' },
    { key: 'triple', label: 'Triple', sub: '+3',  cls: 'btn-triple' },
  ];

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem' }}>🤝 Tie at Bull</div>
        <h2 style={{ marginTop: '0.5rem' }}>Throw-off on {playoffNumber}</h2>
        <p style={{ color: 'var(--muted)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
          {playoffNames}
        </p>
      </div>

      <div className="card scoring-header">
        <div className="target-label">PLAYOFF — throw at</div>
        <div className="target-number">{playoffNumber}</div>
        <div className="round-label">
          <strong>{playerName}</strong> · score: <strong style={{ color: 'var(--accent)' }}>{currentScore}</strong>
        </div>
      </div>

      {/* Scores so far */}
      {Object.keys(scores).length > 0 && (
        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Scores so far</p>
          {playoffPlayers.slice(0, currentIdx).map(pi => (
            <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem' }}>
              <span>{game.players[pi].name}</span>
              <strong style={{ color: 'var(--accent)' }}>{scores[pi] || 0}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Dart slots */}
      <div className="dart-slots">
        {[0, 1, 2].map(i => {
          const result = darts[i];
          return (
            <div key={i} className={`dart-slot${result ? ' ' + result : ''}`}>
              {result ? (
                <>
                  <span className="dart-icon">{SLOT_ICONS[result]}</span>
                  <span>{result}</span>
                </>
              ) : (
                <>
                  <span className="dart-icon" style={{ opacity: 0.3 }}>🎯</span>
                  <span>dart {i + 1}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!setDone && (
        <>
          <p className="section-title" style={{ textAlign: 'center' }}>Dart {darts.length + 1} of 3</p>
          <div className="score-btns">
            {DART_OPTIONS.map(opt => (
              <button key={opt.key} className={`score-btn ${opt.cls}`} onClick={() => handleDart(opt.key)}>
                {opt.label}
                <span className="score-btn-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
          {darts.length > 0 && (
            <button className="btn-secondary" style={{ fontSize: '0.85rem', padding: '0.5rem' }} onClick={undoLast}>
              ↩ Undo last dart
            </button>
          )}
        </>
      )}

      <div style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center' }}>
        Player {currentIdx + 1} of {playoffPlayers.length}
      </div>
    </div>
  );
}
