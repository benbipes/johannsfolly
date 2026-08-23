import { useState, useEffect } from 'react';
import { TARGET_SEQUENCE, BULL_INDEX, processDarts } from '../gameLogic.js';
import { playSound, playRandomMissSwear, isSoundEnabled, toggleSound, unlockAudio } from '../audio.js';

export default function ScoringScreen({
  game,
  player,
  playerIndex,
  myPlayerName,
  roomCode,
  onTurnComplete,
  onShowScoreboard,
  onSync,
  onQuit,
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  function handleToggleSound() {
    setSoundOn(toggleSound());
  }

  async function handleCopyRoomCode() {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch { /* ignore */ }
  }

  // Determine if this device belongs to a specific user
  const boundIdx = myPlayerName
    ? game.players.findIndex(p => p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : -1;
  const isBoundToUser = boundIdx >= 0;

  // Selected player index for scoring on this device
  const [selectedIdx, setSelectedIdx] = useState(isBoundToUser ? boundIdx : playerIndex);

  // Sync selected index if bound user or playerIndex changes
  useEffect(() => {
    setSelectedIdx(isBoundToUser ? boundIdx : playerIndex);
  }, [isBoundToUser, boundIdx, playerIndex]);

  const activePlayer = game.players[selectedIdx] || player;
  const isRoundScored = (activePlayer.roundCompleted ?? 0) >= game.round;

  // darts: array of results for current "set" of 3
  const [darts, setDarts] = useState([]);
  const [turnDarts, setTurnDarts] = useState([]); // all darts in the full turn (across perfect sets)
  const [perfectSets, setPerfectSets] = useState(0);

  // Simulated current target after previous perfect sets in this turn
  const [simulatedTargetIndex, setSimulatedTargetIndex] = useState(activePlayer.targetIndex);

  // Reset local state when round or active player changes
  useEffect(() => {
    setDarts([]);
    setTurnDarts([]);
    setPerfectSets(0);
    setSimulatedTargetIndex(activePlayer.targetIndex);
  }, [game.round, selectedIdx, activePlayer.targetIndex]);

  const dartsInSet = darts.length;
  const setDone = dartsInSet === 3;

  const currentTargetIndex = processDarts(
    { targetIndex: simulatedTargetIndex },
    darts,
  ).newTargetIndex;
  const currentTarget = TARGET_SEQUENCE[currentTargetIndex];

  const dartOptions = [
    { key: 'miss', label: 'Miss', cls: 'btn-miss' },
    { key: 'single', label: 'Single', cls: 'btn-single' },
    { key: 'double', label: 'Double', cls: 'btn-double' },
  ];
  if (currentTargetIndex !== BULL_INDEX) {
    dartOptions.push({ key: 'triple', label: 'Triple', cls: 'btn-triple' });
  }

  function handleDart(type) {
    if (setDone || isRoundScored) return;
    unlockAudio();

    const newDarts = [...darts, type];
    setDarts(newDarts);

    const { newTargetIndex, isPerfect, hitBull } = processDarts(
      { targetIndex: simulatedTargetIndex },
      newDarts,
    );
    const allTurnDarts = [...turnDarts, ...newDarts];

    let specialSoundPlayed = false;

    if (hitBull) {
      playSound('bullseye');
      const isTurnPerfect = (perfectSets > 0 || isPerfect) && !newDarts.every(d => d === 'miss');
      onTurnComplete(selectedIdx, newTargetIndex, allTurnDarts, true, isTurnPerfect);
      setDarts([]);
      setTurnDarts([]);
      setPerfectSets(0);
      setSimulatedTargetIndex(newTargetIndex);
      return;
    }

    if (newDarts.length === 3) {
      const isAllMiss = newDarts.every(d => d === 'miss');
      const hadPerfect = perfectSets > 0 || !!activePlayer?.lastIsPerfect;
      const isCurse = isAllMiss && hadPerfect;
      const isSilverLining = newDarts[0] === 'miss' && newDarts[1] === 'miss' && newDarts[2] === 'triple';
      const marksScoredInSet = newTargetIndex - simulatedTargetIndex;
      const isOneMark = marksScoredInSet === 1;

      // 3 misses can NEVER be a perfect throw
      const effectiveIsPerfect = isAllMiss ? false : isPerfect;

      let soundDelayMs = 0;

      if (isCurse) {
        playSound('curse');
        specialSoundPlayed = true;
        soundDelayMs = 3800; // 3.8s duration for curse.mp3
      } else if (isSilverLining) {
        playSound('silverlining');
        specialSoundPlayed = true;
        soundDelayMs = 3000;
      } else if (isOneMark) {
        playSound('onedartatatime');
        specialSoundPlayed = true;
        soundDelayMs = 3000;
      } else if (isAllMiss) {
        // 3 misses (not a curse throw) — ALWAYS play one of the swear audio clips (mf1 - mf7)
        playRandomMissSwear();
        specialSoundPlayed = true;
        soundDelayMs = 1600;
      }

      if (!effectiveIsPerfect) {
        // Submit score for this round
        // Turn counts as having a perfect throw for the next round only if it contained a perfect set and was NOT a curse
        const turnWasPerfect = perfectSets > 0 && !isCurse;
        onTurnComplete(selectedIdx, newTargetIndex, allTurnDarts, false, turnWasPerfect, soundDelayMs);
        setDarts([]);
        setTurnDarts([]);
        setPerfectSets(0);
        setSimulatedTargetIndex(newTargetIndex);
      } else {
        // Perfect throw! Immediately continue with next set of 3 bonus darts
        playSound('perfect');
        specialSoundPlayed = true;
        setSimulatedTargetIndex(newTargetIndex);
        setTurnDarts(allTurnDarts);
        setPerfectSets(s => s + 1);
        setDarts([]);
      }
    }

    if (!specialSoundPlayed) {
      playSound(type);
    }
  }

  function undoLast() {
    if (darts.length === 0) return;
    setDarts(prev => prev.slice(0, -1));
  }

  const roundsCount = Math.max(game.round, 1);

  // Sort players by progress for mini standings
  const sortedPlayers = game.players
    .map((p, i) => ({ ...p, originalIndex: i }))
    .sort((a, b) => b.targetIndex - a.targetIndex);

  const submittedCount = game.players.filter(p => p.finished || (p.roundCompleted ?? 0) >= game.round).length;

  return (
    <div className="screen figma-scoring-screen">
      {/* Top Bar: Round Badge on Left, Room Code in Center, Quit Pill on Right */}
      <div className="figma-header-bar">
        <div className="figma-round-pill">Round {game.round}</div>
        {roomCode && (
          <button
            className="figma-room-pill"
            onClick={handleCopyRoomCode}
            title="Click to copy room code"
          >
            {copiedCode ? '✓ Copied' : `🔑 Room: ${roomCode}`}
          </button>
        )}
        <div className="spacer" />
        {onSync && (
          <button
            className="figma-quit-pill"
            style={{ marginRight: '0.4rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}
            onClick={onSync}
            title="Force re-sync room state across devices"
          >
            🔄 Sync
          </button>
        )}
        <button
          className="figma-quit-pill"
          style={{ marginRight: '0.4rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}
          onClick={handleToggleSound}
          title="Toggle sound effects"
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        {onShowScoreboard && (
          <button
            className="figma-quit-pill"
            style={{ marginRight: '0.4rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}
            onClick={onShowScoreboard}
          >
            📊 Board
          </button>
        )}
        <button className="figma-quit-pill" onClick={onQuit}>
          ✕ QUIT
        </button>
      </div>

      {/* Player Tabs — for switching players on shared device */}
      {game.players.length > 1 && !isBoundToUser && (
        <div className="player-tabs">
          {game.players.map((p, idx) => {
            const isSub = (p.roundCompleted ?? 0) >= game.round;
            const isSel = idx === selectedIdx;
            return (
              <button
                key={idx}
                className={`player-tab${isSel ? ' active' : ''}${isSub ? ' submitted' : ''}`}
                onClick={() => setSelectedIdx(idx)}
              >
                {isSub ? '✓ ' : ''}{p.name}
              </button>
            );
          })}
        </div>
      )}

      {/* If this player has submitted their round score */}
      {isRoundScored ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem', color: 'var(--accent)' }}>✓</div>
          <h2>Round {game.round} Score Submitted!</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.3rem', marginTop: '0.35rem' }}>
            {activePlayer.name}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '1.05rem', marginTop: '0.75rem' }}>
            Waiting for remaining players to submit Round {game.round}… ({submittedCount} / {game.players.length} ready)
          </p>
        </div>
      ) : (
        <>
          {/* Main Turn Section */}
          <div className="figma-turn-section">
            <div className="figma-turn-title">
              Scoring Turn — {activePlayer.name}
            </div>

            <div className="figma-target-and-slots">
              <div className="figma-hero-target">
                {currentTarget === 'Bull' ? '🎯 Bull' : currentTarget}
              </div>

              <div className="figma-dart-slots-wrap">
                {[0, 1, 2].map(i => {
                  const result = darts[i];
                  return (
                    <div key={i} className={`figma-dart-card ${result || 'empty'}`}>
                      <div className="figma-dart-icon">
                        {result === 'miss' && <span className="icon-miss">✕</span>}
                        {result === 'single' && <span className="icon-dot">●</span>}
                        {result === 'double' && <span className="icon-dots-2">●●</span>}
                        {result === 'triple' && <span className="icon-dots-3">∴</span>}
                        {!result && <span className="icon-empty"></span>}
                      </div>
                      <div className="figma-dart-name">Dart {i + 1}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2x2 Score Buttons Grid */}
          {!setDone && (
            <div className="figma-score-grid-wrap">
              <div className="figma-score-grid">
                {dartOptions.map(opt => (
                  <button
                    key={opt.key}
                    className={`figma-score-btn ${opt.cls}`}
                    onClick={() => handleDart(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {darts.length > 0 && (
                <button
                  className="btn-secondary"
                  style={{ width: '100%', marginTop: '0.65rem', padding: '0.6rem', fontSize: '1rem' }}
                  onClick={undoLast}
                >
                  ↩ Undo last dart
                </button>
              )}
            </div>
          )}

          {setDone && (
            <div style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 700, padding: '1rem 0' }}>
              Calculating score…
            </div>
          )}
        </>
      )}

      {/* Current Standings Card */}
      <div className="card figma-standings-card">
        <p className="figma-standings-title">
          CURRENT STANDINGS — ROUND {game.round}
        </p>
        <div className="figma-standings-list">
          {sortedPlayers.map((p) => {
            const isCurrent = p.originalIndex === selectedIdx;
            const isMe = myPlayerName && p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase();
            const atBull = p.targetIndex === BULL_INDEX;
            const target = TARGET_SEQUENCE[p.targetIndex];
            const marks = p.marks ?? p.targetIndex ?? 0;
            const mpr = (marks / roundsCount).toFixed(1);
            const isPerfect = p.perfectInRound === game.round || (p.lastIsPerfect && (p.roundCompleted ?? 0) === game.round);
            const hasScoredThisRound = (p.roundCompleted ?? 0) >= game.round;

            return (
              <div
                key={p.originalIndex}
                className={`figma-standings-row${isCurrent ? ' active-player' : ''}${p.finished ? ' finished' : ''}`}
              >
                <div className="figma-row-left">
                  <span className="figma-player-name">
                    {p.finished ? '🏆 ' : ''}{p.name}{isMe ? ' (you)' : ''}
                  </span>
                  {isPerfect && <span className="perfect-badge">✨ PERFECT!</span>}
                </div>

                <div className="figma-row-right">
                  {hasScoredThisRound && !p.finished && (
                    <span className="figma-check-icon">✓</span>
                  )}
                  <div className="figma-target-wrap">
                    <span className={`figma-target-val${atBull ? ' at-bull' : ''}`}>
                      {p.finished ? '🎯 Bull' : target}
                    </span>
                    <span className="figma-mpr-val">{mpr} MPR</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prominent Figma Brand Logo Footer */}
      <div className="figma-brand-footer">
        <img src="/logo.png" alt="Johann's Folly" className="figma-brand-logo" />
      </div>
    </div>
  );
}
