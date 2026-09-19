import { useState, useEffect } from 'react';
import { playSound, unlockAudio } from '../audio.js';

/**
 * Simultaneous Playoff / Tie-Breaker Screen.
 *
 * All players who reached the Bullseye participate simultaneously.
 * Each player throws at the chosen playoff target (either a number 1–20 or Bull)
 * on their own device at the same time.
 * If a player hits all 3 darts (no misses), they get 3 bonus darts.
 * Highest total marks / bulls wins. If still tied, next tie-breaker round.
 */

export default function PlayoffScreen({
  game,
  playoffPlayers = [],
  playoffStyle,
  playoffNumber,
  playoffScores = {},
  playoffSubmitted = {},
  playoffRound = 1,
  myPlayerName,
  onChoosePlayoffStyle,
  onPlayoffSubmit,
  onPlayoffComplete,
  onPlayoffTie,
}) {
  const activeStyle = playoffStyle || game?.playoffStyle;
  const isBullTarget = activeStyle === 'bulls' || playoffNumber === 'Bull' || playoffNumber === 25;
  const targetDisplay = isBullTarget ? '🎯 Bull' : (playoffNumber ?? '—');

  // Determine if logged-in user is one of the playoff players
  const boundIdx = myPlayerName
    ? playoffPlayers.find(pi => game?.players[pi]?.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : undefined;
  const isParticipant = myPlayerName ? (boundIdx !== undefined) : true;

  // Selected player index on this device (defaults to bound user, or first playoff player)
  const [selectedIdx, setSelectedIdx] = useState(boundIdx !== undefined ? boundIdx : (playoffPlayers[0] ?? 0));

  useEffect(() => {
    if (boundIdx !== undefined) {
      setSelectedIdx(boundIdx);
    } else if (!playoffPlayers.includes(selectedIdx) && playoffPlayers.length > 0) {
      setSelectedIdx(playoffPlayers[0]);
    }
  }, [boundIdx, playoffPlayers, selectedIdx]);

  // Local turn state for the active throwing player on this device
  const [darts, setDarts] = useState([]);
  const [accumulatedScore, setAccumulatedScore] = useState(0);
  const [extraSets, setExtraSets] = useState(0);

  // Reset local throw state when target or playoff round changes
  useEffect(() => {
    setDarts([]);
    setAccumulatedScore(0);
    setExtraSets(0);
  }, [playoffRound, playoffNumber, selectedIdx]);

  const activePlayer = game?.players[selectedIdx];
  const isSelectedSubmitted = Boolean(playoffSubmitted[selectedIdx]);
  const currentLiveScore = (playoffScores[selectedIdx] ?? accumulatedScore);

  const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };
  const dartOptions = [
    { key: 'miss', label: 'Miss', cls: 'btn-miss' },
    { key: 'single', label: isBullTarget ? 'Single Bull (1)' : 'Single', cls: 'btn-single' },
    { key: 'double', label: isBullTarget ? 'Double Bull (2)' : 'Double', cls: 'btn-double' },
  ];
  if (!isBullTarget) {
    dartOptions.push({ key: 'triple', label: 'Triple', cls: 'btn-triple' });
  }

  function handleDart(type) {
    if (darts.length >= 3 || isSelectedSubmitted) return;
    unlockAudio();

    if (isBullTarget) {
      playSound(type === 'miss' ? 'miss' : 'bullseye');
    } else {
      playSound(type);
    }

    const newDarts = [...darts, type];
    setDarts(newDarts);

    if (newDarts.length === 3) {
      const hitsInSet = newDarts.filter(d => d !== 'miss');
      const marksInSet = newDarts.reduce((acc, d) => {
        if (d === 'miss') return acc;
        return acc + (d === 'single' ? 1 : d === 'double' ? 2 : 3);
      }, 0);

      const isPerfectSet = hitsInSet.length === 3; // all 3 hit!

      if (isPerfectSet) {
        playSound('perfect');
        setAccumulatedScore(prev => prev + marksInSet);
        setExtraSets(s => s + 1);
        setDarts([]);
      } else {
        const finalScore = accumulatedScore + marksInSet;
        setAccumulatedScore(finalScore);
        setDarts([]);
        if (typeof onPlayoffSubmit === 'function') {
          onPlayoffSubmit(selectedIdx, finalScore);
        }
      }
    }
  }

  function undoLast() {
    if (darts.length === 0 || isSelectedSubmitted) return;
    setDarts(prev => prev.slice(0, -1));
  }

  // Count ready/submitted
  const submittedCount = playoffPlayers.filter(pi => playoffSubmitted[pi]).length;
  const allSubmitted = playoffPlayers.length > 0 && submittedCount === playoffPlayers.length;

  // Auto-resolve when all submitted
  useEffect(() => {
    if (!allSubmitted) return;

    // Determine highest score
    const scoresArray = playoffPlayers.map(pi => playoffScores[pi] ?? 0);
    const maxScore = Math.max(...scoresArray);
    const winners = playoffPlayers.filter(pi => (playoffScores[pi] ?? 0) === maxScore);

    const timer = setTimeout(() => {
      if (winners.length === 1) {
        if (typeof onPlayoffComplete === 'function') {
          onPlayoffComplete(winners, playoffScores);
        }
      } else if (winners.length > 1) {
        if (typeof onPlayoffTie === 'function') {
          onPlayoffTie(winners);
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [allSubmitted, playoffPlayers, playoffScores, onPlayoffComplete, onPlayoffTie]);

  const playoffNames = playoffPlayers.map(pi => game?.players[pi]?.name).filter(Boolean).join(' vs ');

  // ── FORMAT SELECTION SCREEN (When playoff reached but style not chosen yet) ──
  if (!activeStyle) {
    if (isParticipant) {
      return (
        <div className="screen">
          <div className="card" style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.35rem' }}>🤝</div>
            <h2>Tie at Bullseye!</h2>
            <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', marginTop: '0.25rem' }}>
              {playoffNames}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
              Both players closed the Bullseye in Round {game?.round || 1}!
            </p>
          </div>

          <div className="card" style={{ padding: '1.25rem 1rem' }}>
            <p className="section-title" style={{ marginBottom: '0.4rem', textAlign: 'center' }}>
              Choose Playoff Format
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.15rem' }}>
              Either player can select the tie-breaker format to begin the throw-off:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <button
                type="button"
                className="rule-pill"
                style={{ padding: '1.15rem 1rem', textAlign: 'left', alignItems: 'flex-start', cursor: 'pointer', width: '100%' }}
                onClick={() => onChoosePlayoffStyle?.('random')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '1.6rem' }}>🎯</span>
                  <div>
                    <strong style={{ fontSize: '1.15rem', color: 'var(--accent)' }}>Random Number</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>(1–20)</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.45rem 0 0', lineHeight: 1.45 }}>
                  A random number from 1 to 20 is drawn. Tied players throw 3 darts simultaneously at that number. Singles = 1, Doubles = 2, Triples = 3. 3 hits earns 3 bonus darts!
                </p>
              </button>

              <button
                type="button"
                className="rule-pill"
                style={{ padding: '1.15rem 1rem', textAlign: 'left', alignItems: 'flex-start', cursor: 'pointer', width: '100%' }}
                onClick={() => onChoosePlayoffStyle?.('bulls')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '1.6rem' }}>🎯</span>
                  <div>
                    <strong style={{ fontSize: '1.15rem', color: 'var(--accent)' }}>Add-Up Bulls</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>(Bullseye)</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.45rem 0 0', lineHeight: 1.45 }}>
                  Both players throw 3 darts simultaneously at the Bullseye. Single Bull = 1, Double Bull = 2. 3 hits earns 3 bonus darts. Highest total bulls wins!
                </p>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Observer waiting screen
    return (
      <div className="screen">
        <div className="card" style={{ textAlign: 'center', padding: '1.75rem 1rem' }}>
          <div style={{ fontSize: '2.75rem', marginBottom: '0.5rem' }}>🤝</div>
          <h2>Tie at Bullseye!</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.15rem', marginTop: '0.35rem' }}>
            {playoffNames}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            Waiting for tied players to choose tie-breaker format…
          </p>
          <div style={{
            display: 'inline-block',
            marginTop: '1.25rem',
            padding: '0.6rem 1.1rem',
            borderRadius: '20px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: '0.85rem',
          }}>
            Options: 🎯 Random Number or 🎯 Add-Up Bulls
          </div>
        </div>
      </div>
    );
  }

  // ── OBSERVER SCREEN (Non-participating logged-in players) ───────────
  if (myPlayerName && !isParticipant) {
    return (
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <h2>Tie-Breaker: {isBullTarget ? 'Add Up Bulls' : 'Playoff'}</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.4rem', marginTop: '0.35rem' }}>
            Target: {targetDisplay}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
            Observing live tie-breaker (Round {playoffRound})…
          </p>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>
            Live Progress ({submittedCount} / {playoffPlayers.length} finished)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {playoffPlayers.map(pi => {
              const p = game?.players[pi];
              const isSub = Boolean(playoffSubmitted[pi]);
              const score = playoffScores[pi] ?? 0;
              return (
                <div
                  key={pi}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    background: isSub ? 'rgba(0, 230, 118, 0.08)' : 'var(--surface2)',
                    border: isSub ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p?.name}</span>
                    <div style={{ fontSize: '0.8rem', color: isSub ? 'var(--accent)' : 'var(--muted)', marginTop: '0.15rem' }}>
                      {isSub ? '✓ Finished' : '🎯 Throwing now…'}
                    </div>
                  </div>
                  <strong style={{ color: 'var(--accent)', fontSize: '1.3rem' }}>
                    {isSub ? `${score} mark${score !== 1 ? 's' : ''}` : '—'}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── PARTICIPANT SCREEN (Simultaneous Throwing) ───────────────────
  return (
    <div className="screen">
      <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>🤝 Tie at Bull</div>
        <h2 style={{ marginTop: '0.35rem' }}>
          {isBullTarget ? 'Bullseye Throw-off' : `Throw-off on ${targetDisplay}`}
        </h2>
        <p style={{ color: 'var(--muted)', marginTop: '0.25rem', fontSize: '0.88rem' }}>
          {playoffNames} · Round {playoffRound}
        </p>
      </div>

      {/* Player Tabs for shared device without distinct logins */}
      {playoffPlayers.length > 1 && !myPlayerName && (
        <div className="player-tabs">
          {playoffPlayers.map(pi => {
            const p = game?.players[pi];
            const isSub = Boolean(playoffSubmitted[pi]);
            const isSel = pi === selectedIdx;
            return (
              <button
                key={pi}
                type="button"
                className={`player-tab${isSel ? ' active' : ''}${isSub ? ' submitted' : ''}`}
                onClick={() => setSelectedIdx(pi)}
              >
                {isSub ? '✓ ' : ''}{p?.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Target & Active Status */}
      <div className="card scoring-header" style={{ padding: '1.15rem 1rem' }}>
        <div className="target-label">
          {isBullTarget ? 'TIE-BREAKER — THROW AT BULL' : 'TIE-BREAKER — THROW AT'}
        </div>
        <div className="target-number" style={{ fontSize: isBullTarget ? '2.8rem' : '3.6rem' }}>
          {targetDisplay}
        </div>
        <div className="round-label">
          <strong>{activePlayer?.name}</strong> · Total: <strong style={{ color: 'var(--accent)' }}>{currentLiveScore}</strong>
          {extraSets > 0 && (
            <span style={{ color: 'var(--accent2)', marginLeft: '0.5rem' }}>
              ✨ ×{extraSets} bonus set!
            </span>
          )}
        </div>
      </div>

      {/* Active Throwing Area */}
      {isSelectedSubmitted ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>✓</div>
          <h3>Score Submitted!</h3>
          <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', marginTop: '0.35rem' }}>
            {currentLiveScore} mark{currentLiveScore !== 1 ? 's' : ''}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
            {allSubmitted
              ? 'Tallying playoff results…'
              : `Waiting for remaining players to finish… (${submittedCount} / ${playoffPlayers.length} ready)`}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: '1.25rem 1rem' }}>
          {/* Dart slots */}
          <div className="dart-slots" style={{ marginBottom: '1rem' }}>
            {[0, 1, 2].map(i => {
              const result = darts[i];
              return (
                <div key={i} className={`dart-slot${result ? ' ' + result : ''}`}>
                  {result ? (
                    <>
                      <span className="dart-icon">{SLOT_ICONS[result] || '🎯'}</span>
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

          {/* Dart Scoring Buttons */}
          <div className="score-btns">
            {dartOptions.map(opt => (
              <button
                key={opt.key}
                type="button"
                className={`score-btn ${opt.cls}`}
                onClick={() => handleDart(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {darts.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.65rem', padding: '0.55rem', fontSize: '0.95rem' }}
              onClick={undoLast}
            >
              ↩ Undo last dart
            </button>
          )}
        </div>
      )}

      {/* Live Standings Card of all tied players */}
      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.65rem' }}>
          Tie-Breaker Standings ({submittedCount} / {playoffPlayers.length} ready)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {playoffPlayers.map(pi => {
            const p = game?.players[pi];
            const isSub = Boolean(playoffSubmitted[pi]);
            const score = playoffScores[pi] ?? (pi === selectedIdx ? accumulatedScore : 0);
            const isMe = pi === selectedIdx;
            return (
              <div
                key={pi}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '8px',
                  background: isMe ? 'var(--surface2)' : 'transparent',
                  border: isMe ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 700 }}>
                    {p?.name}{isMe ? ' (you)' : ''}
                  </span>
                  <div style={{ fontSize: '0.8rem', color: isSub ? 'var(--accent)' : 'var(--muted)' }}>
                    {isSub ? '✓ Submitted' : '🎯 Throwing…'}
                  </div>
                </div>
                <strong style={{ color: 'var(--accent)', fontSize: '1.15rem' }}>
                  {isSub ? `${score} mark${score !== 1 ? 's' : ''}` : '—'}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
