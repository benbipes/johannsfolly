import { useState } from 'react';

/**
 * Playoff screen.
 *
 * Only players who reached the Bullseye participate in the playoff throw-off.
 * Each playoff player throws at the chosen playoff number for 1 round of 3 darts.
 * If a player hits all 3 darts (no misses), they get 3 bonus darts to continue throwing.
 * Final tally of hits on the number determines the winner.
 * Non-playoff players observe live progress from their devices.
 */

export default function PlayoffScreen({
  game,
  playoffPlayers = [],
  playoffNumber,
  playoffScores = {},
  playoffCurrentIdx = 0,
  myPlayerName,
  onPlayoffComplete,
  onPlayoffUpdate,
  onPlayoffTie,
}) {
  const [localScores, setLocalScores] = useState({}); // playerIndex -> total hits
  const [darts, setDarts] = useState([]);
  const [extraSets, setExtraSets] = useState(0);

  // Combine parent scores with local scores
  const mergedScores = { ...playoffScores, ...localScores };
  const currentIdx = typeof playoffCurrentIdx === 'number' ? playoffCurrentIdx : 0;

  // Determine if the logged-in user is a playoff participant
  const isParticipant = myPlayerName
    ? playoffPlayers.some(pi => game?.players[pi]?.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : true; // fallback if no login name set

  const activePlayerIdx = playoffPlayers[currentIdx];
  const activePlayerName = game?.players[activePlayerIdx]?.name ?? '';
  const isMyTurn = myPlayerName
    ? activePlayerName.trim().toLowerCase() === myPlayerName.trim().toLowerCase()
    : true;

  function handleDart(type) {
    if (darts.length >= 3) return;
    const newDarts = [...darts, type];
    setDarts(newDarts);

    if (newDarts.length === 3) {
      const hitsInSet = newDarts.filter(d => d !== 'miss');
      const hitMarksInSet = newDarts.reduce((acc, d) => {
        if (d === 'miss') return acc;
        return acc + (d === 'single' ? 1 : d === 'double' ? 2 : 3);
      }, 0);

      const isPerfectSet = hitsInSet.length === 3; // all 3 hit, no misses!

      const playerIdx = playoffPlayers[currentIdx];
      const prevScore = mergedScores[playerIdx] || 0;
      const updatedScore = prevScore + hitMarksInSet;

      const newScores = { ...mergedScores, [playerIdx]: updatedScore };
      setLocalScores(newScores);

      if (isPerfectSet) {
        // Perfect throw! Keep throwing 3 more bonus darts
        setExtraSets(s => s + 1);
        setDarts([]);
        if (typeof onPlayoffUpdate === 'function') {
          onPlayoffUpdate(newScores, currentIdx);
        }
      } else {
        // Turn complete for this player — advance to next playoff player
        advancePlayer(newScores);
      }
    }
  }

  function advancePlayer(newScores) {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= playoffPlayers.length) {
      // All playoff players done for this playoff round — find max score
      const maxScore = Math.max(...Object.values(newScores));
      const winners = playoffPlayers.filter(pi => (newScores[pi] || 0) === maxScore);
      if (winners.length > 1 && typeof onPlayoffTie === 'function') {
        // TIE in playoff! Launch a 2nd playoff round with a new random number for tied players!
        onPlayoffTie(winners);
      } else {
        // Sole winner! Complete playoff and exit to winner screen!
        onPlayoffComplete(winners, newScores);
      }
    } else {
      setDarts([]);
      setExtraSets(0);
      if (typeof onPlayoffUpdate === 'function') {
        onPlayoffUpdate(newScores, nextIdx);
      }
    }
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  const playoffNames = playoffPlayers.map(pi => game?.players[pi]?.name).filter(Boolean).join(', ');
  const currentScore = mergedScores[activePlayerIdx] || 0;

  const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };
  const DART_OPTIONS = [
    { key: 'miss',   label: 'Miss',   sub: '0',   cls: 'btn-miss' },
    { key: 'single', label: 'Hit',    sub: '+1',  cls: 'btn-single' },
    { key: 'double', label: 'Double', sub: '+2',  cls: 'btn-double' },
    { key: 'triple', label: 'Triple', sub: '+3',  cls: 'btn-triple' },
  ];

  // ── OBSERVER SCREEN (Non-Playoff Players) ─────────────────────
  if (!isParticipant) {
    return (
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <h2>Playoff Throw-off</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.2rem', marginTop: '0.5rem' }}>
            Target Number: {playoffNumber}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Observing live playoff throw-off...
          </p>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Playoff Scores</p>
          {playoffPlayers.map((pi, idx) => {
            const p = game?.players[pi];
            const isCurrent = idx === currentIdx;
            const score = mergedScores[pi] || 0;
            return (
              <div
                key={pi}
                style={{
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background: isCurrent ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                  border: isCurrent ? '1px solid var(--accent)' : '1px solid transparent',
                  marginBottom: '0.4rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{p?.name}</span>
                  {isCurrent && (
                    <span style={{ color: 'var(--accent)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      🎯 throwing...
                    </span>
                  )}
                </div>
                <strong style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>
                  {score} mark{score !== 1 ? 's' : ''}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── PARTICIPANT SCREEN (Playoff Players) ──────────────────────
  const setDone = darts.length === 3;

  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem' }}>🤝 Tie at Bull</div>
        <h2 style={{ marginTop: '0.5rem' }}>Throw-off on {playoffNumber}</h2>
        <p style={{ color: 'var(--muted)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
          Playoff Players: {playoffNames}
        </p>
      </div>

      <div className="card scoring-header">
        <div className="target-label">PLAYOFF — throw at</div>
        <div className="target-number">{playoffNumber}</div>
        <div className="round-label">
          <strong>{activePlayerName}</strong> · score: <strong style={{ color: 'var(--accent)' }}>{currentScore}</strong>
          {extraSets > 0 && (
            <span style={{ color: 'var(--accent2)', marginLeft: '0.5rem' }}>
              ✨ ×{extraSets} perfect (+3 bonus darts)
            </span>
          )}
        </div>
      </div>

      {/* Scores so far */}
      {Object.keys(mergedScores).length > 0 && (
        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Scores so far</p>
          {playoffPlayers.map(pi => (
            <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem' }}>
              <span>{game?.players[pi]?.name}</span>
              <strong style={{ color: 'var(--accent)' }}>{mergedScores[pi] || 0}</strong>
            </div>
          ))}
        </div>
      )}

      {isMyTurn ? (
        <>
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
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>
            Waiting for <strong>{activePlayerName}</strong> to complete their throw...
          </p>
        </div>
      )}

      <div style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center' }}>
        Playoff Turn {currentIdx + 1} of {playoffPlayers.length}
      </div>
    </div>
  );
}
