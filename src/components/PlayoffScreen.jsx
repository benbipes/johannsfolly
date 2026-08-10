import { useState } from 'react';

/**
 * Playoff screen.
 *
 * Phase 1: pick_number
 *   A non-winning player throws left-handed. We ask which number they hit.
 *
 * Phase 2: throwing
 *   Each playoff player throws at the playoff number.
 *   Score is number of hits (single=1, double=2, triple=3).
 *   Perfect throw (all 3 hit) gives 3 bonus darts.
 */

const DART_NUMBERS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,'Bull'];

export default function PlayoffScreen({ game, playoffPlayers, onPlayoffComplete }) {
  const [phase, setPhase] = useState('pick_number'); // 'pick_number' | 'throwing' | 'done'
  const [playoffNumber, setPlayoffNumber] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({}); // playerIndex -> total hits
  const [darts, setDarts] = useState([]);
  const [showPerfect, setShowPerfect] = useState(false);
  const [extraSets, setExtraSets] = useState(0);

  // Find a non-winner for left-hand throw
  const throwerForPick = game.players.find((p, i) => !playoffPlayers.includes(i));
  const throwerName = throwerForPick ? throwerForPick.name : 'Someone';

  function confirmNumber() {
    if (!playoffNumber) return;
    setPhase('throwing');
  }

  function handleDart(type) {
    if (darts.length >= 3) return;
    const newDarts = [...darts, type];
    setDarts(newDarts);

    if (newDarts.length === 3) {
      const hits = newDarts.filter(d => d !== 'miss');
      const hitCount = newDarts.reduce((acc, d) => {
        if (d === 'miss') return acc;
        return acc + (d === 'single' ? 1 : d === 'double' ? 2 : 3);
      }, 0);
      const allHit = hits.length === 3;

      const playerIdx = playoffPlayers[currentIdx];
      const prevScore = scores[playerIdx] || 0;

      if (allHit) {
        // Perfect throw
        setScores(prev => ({ ...prev, [playerIdx]: prevScore + hitCount }));
        setExtraSets(s => s + 1);
        setShowPerfect(true);
      } else {
        // Done
        const finalScore = prevScore + hitCount;
        const newScores = { ...scores, [playerIdx]: finalScore };
        setScores(newScores);
        advancePlayer(newScores);
      }
    }
  }

  function handleContinueAfterPerfect() {
    setDarts([]);
    setShowPerfect(false);
  }

  function advancePlayer(newScores) {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= playoffPlayers.length) {
      // All done – find winner(s)
      const maxScore = Math.max(...Object.values(newScores));
      const winners = playoffPlayers.filter(pi => (newScores[pi] || 0) === maxScore);
      onPlayoffComplete(winners, newScores);
    } else {
      setCurrentIdx(nextIdx);
      setDarts([]);
      setExtraSets(0);
    }
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  if (phase === 'pick_number') {
    return (
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>🤝 Tie!</div>
          <h2 style={{ marginTop: '0.5rem' }}>Playoff Time</h2>
          <p style={{ color: 'var(--muted)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--text)' }}>{throwerName}</strong> throws left-handed.
            <br />Which number did they hit?
          </p>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Select Playoff Number</p>
          <div className="playoff-number-pick">
            {DART_NUMBERS.map(n => (
              <button
                key={n}
                className={`num-btn${playoffNumber === n ? ' selected' : ''}`}
                onClick={() => setPlayoffNumber(n)}
              >
                {n === 'Bull' ? '🎯' : n}
              </button>
            ))}
          </div>
        </div>

        <div className="spacer" />
        <button className="btn-primary" disabled={!playoffNumber} onClick={confirmNumber}>
          Start Playoff → {playoffNumber ?? '?'}
        </button>
      </div>
    );
  }

  // throwing phase
  const playerIdx = playoffPlayers[currentIdx];
  const playerName = game.players[playerIdx].name;
  const setDone = darts.length === 3;
  const currentScore = scores[playerIdx] || 0;

  const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };
  const DART_OPTIONS = [
    { key: 'miss',   label: 'Miss',   sub: '0',   cls: 'btn-miss' },
    { key: 'single', label: 'Hit',    sub: '+1',  cls: 'btn-single' },
    { key: 'double', label: 'Double', sub: '+2',  cls: 'btn-double' },
    { key: 'triple', label: 'Triple', sub: '+3',  cls: 'btn-triple' },
  ];

  return (
    <div className="screen">
      <div className="card scoring-header">
        <div className="target-label">PLAYOFF — throw at</div>
        <div className="target-number">{playoffNumber === 'Bull' ? '🎯 Bull' : playoffNumber}</div>
        <div className="round-label">
          <strong>{playerName}</strong> · score so far: <strong style={{ color: 'var(--accent)' }}>{currentScore}</strong>
          {extraSets > 0 && (
            <span style={{ color: 'var(--accent2)', marginLeft: '0.5rem' }}>
              ✨ ×{extraSets} perfect
            </span>
          )}
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

      {showPerfect && (
        <div className="perfect-banner">
          <h2>✨ Perfect Throw!</h2>
          <p>3 bonus darts!</p>
          <button className="btn-success" style={{ marginTop: '0.75rem', width: '100%' }} onClick={handleContinueAfterPerfect}>
            Throw Bonus Darts →
          </button>
        </div>
      )}

      {!showPerfect && !setDone && (
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
