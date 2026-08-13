import { useState, useEffect } from 'react';
import { TARGET_SEQUENCE, BULL_INDEX, processDarts } from '../gameLogic.js';

const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };

function getTargetsForMarks(targetIndex, marks) {
  const targets = [];
  let nextTargetIndex = targetIndex;

  for (let i = 0; i < marks; i += 1) {
    targets.push(TARGET_SEQUENCE[nextTargetIndex]);
    if (nextTargetIndex === BULL_INDEX) break;
    nextTargetIndex = Math.min(nextTargetIndex + 1, BULL_INDEX);
  }

  return targets.join(' → ');
}

export default function ScoringScreen({
  game,
  player,
  playerIndex,
  myPlayerName,
  onTurnComplete,
  onShowScoreboard,
  onQuit,
}) {
  // Check if current device is bound to a single user in multi-device mode
  const matchedIdx = myPlayerName
    ? game.players.findIndex(p => p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : -1;
  const isBoundToUser = matchedIdx >= 0;

  const currentPlayerIdx = isBoundToUser ? matchedIdx : playerIndex;
  const activePlayer = game.players[currentPlayerIdx] || player;

  // In multi-device mode, skip hand-off gate.
  // In single-device pass & play mode, show hand-off gate when switching players.
  const [ready, setReady] = useState(isBoundToUser);

  useEffect(() => {
    if (!isBoundToUser) {
      setReady(false);
    }
  }, [currentPlayerIdx, game.round, isBoundToUser]);

  // Has active player already scored for current round?
  const isRoundScored = (activePlayer.roundCompleted ?? 0) >= game.round;

  // darts: array of results for current "set" of 3
  const [darts, setDarts] = useState([]);
  const [turnDarts, setTurnDarts] = useState([]); // all darts in the full turn (across perfect sets)
  const [perfectSets, setPerfectSets] = useState(0);

  // Simulated current target after previous perfect sets in this turn
  const [simulatedTargetIndex, setSimulatedTargetIndex] = useState(activePlayer.targetIndex);

  // Reset local state when a new round starts
  useEffect(() => {
    setDarts([]);
    setTurnDarts([]);
    setPerfectSets(0);
    setSimulatedTargetIndex(activePlayer.targetIndex);
  }, [game.round, activePlayer.targetIndex]);

  const dartsInSet = darts.length;
  const setDone = dartsInSet === 3;

  const currentTargetIndex = processDarts(
    { targetIndex: simulatedTargetIndex },
    darts,
  ).newTargetIndex;
  const currentTarget = TARGET_SEQUENCE[currentTargetIndex];

  const dartOptions = [
    { key: 'miss', label: 'Miss', sub: String(currentTarget), cls: 'btn-miss' },
    { key: 'single', label: 'Hit', sub: getTargetsForMarks(currentTargetIndex, 1), cls: 'btn-single' },
    { key: 'double', label: 'Double', sub: getTargetsForMarks(currentTargetIndex, 2), cls: 'btn-double' },
  ];
  if (currentTargetIndex !== BULL_INDEX) {
    dartOptions.push({ key: 'triple', label: 'Triple', sub: getTargetsForMarks(currentTargetIndex, 3), cls: 'btn-triple' });
  }

  function handleDart(type) {
    if (setDone || isRoundScored) return;
    const newDarts = [...darts, type];
    setDarts(newDarts);

    const { newTargetIndex, isPerfect, hitBull } = processDarts(
      { targetIndex: simulatedTargetIndex },
      newDarts,
    );
    const allTurnDarts = [...turnDarts, ...newDarts];

    if (hitBull) {
      onTurnComplete(currentPlayerIdx, newTargetIndex, allTurnDarts, true, perfectSets > 0 || isPerfect);
      return;
    }

    if (newDarts.length === 3) {
      if (!isPerfect) {
        // Set complete — submit score for this round
        onTurnComplete(currentPlayerIdx, newTargetIndex, allTurnDarts, false, perfectSets > 0 || isPerfect);
      } else {
        // Perfect throw! Immediately continue with next set of 3 bonus darts
        setSimulatedTargetIndex(newTargetIndex);
        setTurnDarts(allTurnDarts);
        setPerfectSets(s => s + 1);
        setDarts([]);
      }
    }
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  const progress = currentTargetIndex / BULL_INDEX;
  const roundsCount = Math.max(game.round, 1);

  // Sort players by progress for the mini standings card
  const sortedPlayers = game.players
    .map((p, i) => ({ ...p, originalIndex: i }))
    .sort((a, b) => b.targetIndex - a.targetIndex);

  // ── HAND-OFF GATE (Single-device Pass & Play) ─────────────────────
  if (!ready) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="round-badge">Round {game.round}</div>
          <div className="spacer" />
          <button
            className="btn-danger"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={onQuit}
          >
            ✕ Quit
          </button>
        </div>

        <div className="handoff-screen">
          <div className="handoff-icon">📲</div>
          <h2>Pass the device to</h2>
          <h1 style={{ fontSize: '1.8rem' }}>{activePlayer.name}</h1>
          <p>Hand this device to <strong style={{ color: 'var(--text)' }}>{activePlayer.name}</strong> so they can enter their own darts.</p>
          <button
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setReady(true)}
          >
            I'm {activePlayer.name} — I'm Ready 🎯
          </button>
        </div>

        {/* Mini scoreboard visible during hand-off */}
        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Current Standings — Round {game.round}</p>
          <div className="mini-scoreboard">
            {sortedPlayers.map((p) => {
              const isCurrent = p.originalIndex === currentPlayerIdx;
              const atBull = p.targetIndex === BULL_INDEX;
              const target = TARGET_SEQUENCE[p.targetIndex];
              const marks = p.marks ?? p.targetIndex ?? 0;
              const mpr = (marks / roundsCount).toFixed(1);
              const isPerfect = p.lastIsPerfect || p.perfectCount > 0;
              return (
                <div key={p.originalIndex} className={`mini-score-row${isCurrent ? ' current-player' : ''}${p.finished ? ' finished' : ''}${isPerfect ? ' is-perfect' : ''}`}>
                  <span className="mini-score-name">{p.finished ? '🏆 ' : ''}{p.name}</span>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '3rem' }}>
                    <span className={`mini-score-target${atBull ? ' at-bull' : ''}`}>
                      {p.finished ? '🎯 Bull' : target}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {mpr} MPR
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── LOCKED SCORING VIEW (Multi-device already scored this round) ────
  if (isRoundScored) {
    return (
      <div className="screen">
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="round-badge">Round {game.round}</div>
          <div className="spacer" />
          <button
            className="btn-secondary"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={onShowScoreboard}
          >
            📋 Scores
          </button>
          <button
            className="btn-danger"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
            onClick={onQuit}
          >
            ✕ Quit
          </button>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✓</div>
          <h2>Round {game.round} Complete!</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', marginTop: '0.25rem' }}>
            {activePlayer.name}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Waiting for other players to finish Round {game.round}…
          </p>
        </div>

        {/* Live Standings Card */}
        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Current Standings — Round {game.round}</p>
          <div className="mini-scoreboard">
            {sortedPlayers.map((p) => {
              const isCurrent = p.originalIndex === currentPlayerIdx;
              const isMe = myPlayerName && p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase();
              const atBull = p.targetIndex === BULL_INDEX;
              const target = TARGET_SEQUENCE[p.targetIndex];
              const marks = p.marks ?? p.targetIndex ?? 0;
              const mpr = (marks / roundsCount).toFixed(1);
              const isPerfect = p.lastIsPerfect || p.perfectCount > 0;
              const hasScoredThisRound = (p.roundCompleted ?? 0) >= game.round;

              return (
                <div key={p.originalIndex} className={`mini-score-row${isCurrent ? ' current-player' : ''}${p.finished ? ' finished' : ''}${isPerfect ? ' is-perfect' : ''}`}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                    <span className="mini-score-name">
                      {p.finished ? '🏆 ' : ''}{p.name}{isMe ? ' (you)' : ''}
                    </span>
                    {isPerfect && (
                      <span className="perfect-badge">✨ PERFECT!</span>
                    )}
                    {hasScoredThisRound && !p.finished && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700 }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '3rem' }}>
                    <span className={`mini-score-target${atBull ? ' at-bull' : ''}`}>
                      {p.finished ? '🎯 Bull' : target}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {mpr} MPR
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Game logo brand footer */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem', marginBottom: '0.5rem', opacity: 0.85 }}>
          <img
            src="/logo.png"
            alt="Johann's Folly"
            style={{ height: '32px', width: 'auto', display: 'inline-block', objectFit: 'contain' }}
          />
        </div>
      </div>
    );
  }

  // ── ACTIVE SCORING UI ───────────────────────────────────────────
  return (
    <div className="screen">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className="round-badge">Round {game.round}</div>
        <div className="spacer" />
        <button
          className="btn-secondary"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          onClick={onShowScoreboard}
        >
          📋 Scores
        </button>
        <button
          className="btn-danger"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          onClick={onQuit}
        >
          ✕ Quit
        </button>
      </div>

      {/* Player & target */}
      <div className="card scoring-header">
        <div className="target-label">Now throwing — <strong>{activePlayer.name}</strong></div>
        <div className="target-number">{currentTarget === 'Bull' ? '🎯 Bull' : currentTarget}</div>
        <div style={{ marginTop: '0.5rem' }}>
          <div className="progress-bar-wrap" style={{ height: 6 }}>
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="round-label">
          {simulatedTargetIndex} / {BULL_INDEX} numbers cleared
          {perfectSets > 0 && (
            <span style={{ color: 'var(--accent2)', marginLeft: '0.5rem' }}>
              ✨ ×{perfectSets} perfect
            </span>
          )}
        </div>
      </div>

      {/* Mini scoreboard — always visible */}
      <div className="card">
        <p className="section-title" style={{ marginBottom: '0.5rem' }}>Current Standings — Round {game.round}</p>
        <div className="mini-scoreboard">
          {sortedPlayers.map((p) => {
            const isCurrent = p.originalIndex === currentPlayerIdx;
            const atBull = p.targetIndex === BULL_INDEX;
            const target = TARGET_SEQUENCE[p.targetIndex];
            const marks = p.marks ?? p.targetIndex ?? 0;
            const mpr = (marks / roundsCount).toFixed(1);
            const isPerfect = p.lastIsPerfect || p.perfectCount > 0;
            const hasScoredThisRound = (p.roundCompleted ?? 0) >= game.round;

            return (
              <div key={p.originalIndex} className={`mini-score-row${isCurrent ? ' current-player' : ''}${p.finished ? ' finished' : ''}${isPerfect ? ' is-perfect' : ''}`}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                  <span className="mini-score-name">
                    {p.finished ? '🏆 ' : ''}{p.name}
                  </span>
                  {isPerfect && (
                    <span className="perfect-badge">✨ PERFECT!</span>
                  )}
                  {hasScoredThisRound && !p.finished && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700 }}>
                      ✓
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '3rem' }}>
                  <span className={`mini-score-target${atBull ? ' at-bull' : ''}`}>
                    {p.finished ? '🎯 Bull' : target}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>
                    {mpr} MPR
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

      {/* Score buttons */}
      {!setDone && (
        <>
          <p className="section-title" style={{ textAlign: 'center' }}>Dart {dartsInSet + 1} of 3</p>
          <div className="score-btns">
            {dartOptions.map(opt => (
              <button
                key={opt.key}
                className={`score-btn ${opt.cls}`}
                onClick={() => handleDart(opt.key)}
              >
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

      {/* Waiting for process */}
      {setDone && (
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>Calculating…</div>
      )}

      {/* Game logo brand footer */}
      <div style={{ textAlign: 'center', marginTop: '1.25rem', marginBottom: '0.5rem', opacity: 0.85 }}>
        <img
          src="/logo.png"
          alt="Johann's Folly"
          style={{ height: '32px', width: 'auto', display: 'inline-block', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}
