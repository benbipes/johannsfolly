import { useState } from 'react';
import { TARGET_SEQUENCE, BULL_INDEX, processDarts } from '../gameLogic.js';

const DART_OPTIONS = [
  { key: 'miss',   label: 'Miss',   sub: '0 pts',  cls: 'btn-miss' },
  { key: 'single', label: 'Hit',    sub: '+1',      cls: 'btn-single' },
  { key: 'double', label: 'Double', sub: '+2',      cls: 'btn-double' },
  { key: 'triple', label: 'Triple', sub: '+3',      cls: 'btn-triple' },
];

const SLOT_ICONS = { miss: '✗', single: '🎯', double: '🎯🎯', triple: '🎯🎯🎯' };

export default function ScoringScreen({ game, player, playerIndex, onTurnComplete, onShowScoreboard, onQuit }) {
  // Hand-off gate: show "pass device to player" before revealing scoring UI
  const [ready, setReady] = useState(false);

  // darts: array of results for current "set" of 3
  const [darts, setDarts] = useState([]);
  const [turnDarts, setTurnDarts] = useState([]); // all darts in the full turn (across perfect sets)
  const [perfectSets, setPerfectSets] = useState(0);
  const [showPerfect, setShowPerfect] = useState(false);

  // Simulated current target after previous perfect sets
  const [simulatedTargetIndex, setSimulatedTargetIndex] = useState(player.targetIndex);

  const dartsInSet = darts.length;
  const setDone = dartsInSet === 3;

  const currentTarget = TARGET_SEQUENCE[simulatedTargetIndex];

  function handleDart(type) {
    if (setDone) return;
    const newDarts = [...darts, type];
    setDarts(newDarts);

    if (newDarts.length === 3) {
      // Process this set
      const { newTargetIndex, isPerfect, hitBull } = processDarts(
        { targetIndex: simulatedTargetIndex },
        newDarts,
      );
      const allTurnDarts = [...turnDarts, ...newDarts];

      if (hitBull || !isPerfect) {
        // Turn ends
        onTurnComplete(newTargetIndex, allTurnDarts, hitBull);
      } else {
        // Perfect throw! Show banner then let them throw again
        setSimulatedTargetIndex(newTargetIndex);
        setTurnDarts(allTurnDarts);
        setPerfectSets(s => s + 1);
        setShowPerfect(true);
      }
    }
  }

  function handleContinueAfterPerfect() {
    setDarts([]);
    setShowPerfect(false);
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  const progress = simulatedTargetIndex / BULL_INDEX;

  // Sort players by progress for the mini scoreboard
  const sortedPlayers = game.players
    .map((p, i) => ({ ...p, originalIndex: i }))
    .sort((a, b) => b.targetIndex - a.targetIndex);

  // ── Hand-off gate ──────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="screen">
        {/* Header row with quit */}
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
          <h1 style={{ fontSize: '1.8rem' }}>{player.name}</h1>
          <p>Hand this device to <strong style={{ color: 'var(--text)' }}>{player.name}</strong> so they can enter their own darts.</p>
          <button
            className="btn-primary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setReady(true)}
          >
            I'm {player.name} — I'm Ready 🎯
          </button>
        </div>

        {/* Mini scoreboard visible during hand-off */}
        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Current Standings</p>
          <div className="mini-scoreboard">
            {sortedPlayers.map((p) => {
              const isCurrent = p.originalIndex === playerIndex;
              const atBull = p.targetIndex === BULL_INDEX;
              const target = TARGET_SEQUENCE[p.targetIndex];
              return (
                <div key={p.originalIndex} className={`mini-score-row${isCurrent ? ' current-player' : ''}${p.finished ? ' finished' : ''}`}>
                  <span className="mini-score-name">{p.finished ? '🏆 ' : ''}{p.name}</span>
                  <span className={`mini-score-target${atBull ? ' at-bull' : ''}`}>
                    {p.finished ? '🎯 Bull' : `→ ${target}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Main scoring UI ────────────────────────────────────────────
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
        <div className="target-label">Now throwing — <strong>{player.name}</strong></div>
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
        <p className="section-title" style={{ marginBottom: '0.5rem' }}>Current Standings</p>
        <div className="mini-scoreboard">
          {sortedPlayers.map((p) => {
            const isCurrent = p.originalIndex === playerIndex;
            const atBull = p.targetIndex === BULL_INDEX;
            const target = TARGET_SEQUENCE[p.targetIndex];
            return (
              <div key={p.originalIndex} className={`mini-score-row${isCurrent ? ' current-player' : ''}${p.finished ? ' finished' : ''}`}>
                <span className="mini-score-name">{p.finished ? '🏆 ' : ''}{p.name}</span>
                {isCurrent && !p.finished && (
                  <span style={{ fontSize: '0.7rem', background: 'var(--accent)', color: '#000', borderRadius: '4px', padding: '0.1rem 0.35rem', fontWeight: 700 }}>
                    NOW
                  </span>
                )}
                <span className={`mini-score-target${atBull ? ' at-bull' : ''}`}>
                  {p.finished ? '🎯 Bull' : `→ ${target}`}
                </span>
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

      {/* Perfect banner */}
      {showPerfect && (
        <div className="perfect-banner">
          <h2>✨ Perfect Throw!</h2>
          <p>All 3 darts hit — 3 bonus darts coming up!</p>
          <button className="btn-success" style={{ marginTop: '0.75rem', width: '100%' }} onClick={handleContinueAfterPerfect}>
            Throw Bonus Darts →
          </button>
        </div>
      )}

      {/* Score buttons */}
      {!showPerfect && !setDone && (
        <>
          <p className="section-title" style={{ textAlign: 'center' }}>Dart {dartsInSet + 1} of 3</p>
          <div className="score-btns">
            {DART_OPTIONS.map(opt => (
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
      {!showPerfect && setDone && (
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>Calculating…</div>
      )}
    </div>
  );
}

