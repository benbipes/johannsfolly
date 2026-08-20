import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';

import AuthScreen from './components/AuthScreen.jsx';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';
import LeaderboardView from './components/Leaderboard.jsx';

import { BULL_INDEX, createGame, mergeGameState } from './gameLogic.js';
import { useGameSync } from './useGameSync.js';
import { getLoggedInUser, logout, refreshLoggedUserPresence } from './auth.js';
import { recordGame } from './leaderboard.js';
import { playSound, playNewRoundSound } from './audio.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function choosePlayoffNumber() {
  return Math.floor(Math.random() * 20) + 1;
}

// Advance currentPlayerIndex to next player, wrapping around and bumping round.
function advanceGame(game) {
  const next = (game.currentPlayerIndex + 1) % game.players.length;
  return {
    ...game,
    currentPlayerIndex: next,
    round: next === 0 ? game.round + 1 : game.round,
  };
}

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState(() => getLoggedInUser());
  const [game, setGame] = useState(null);
  const [view, setView] = useState('lobby'); // 'lobby' | 'room' | 'scoring' | 'scoreboard' | 'playoff' | 'winner' | 'leaderboard'
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myPlayerName, setMyPlayerName] = useState(null); // null = no identity (single-device mode)
  const [playoffPlayers, setPlayoffPlayers] = useState([]);
  const [finalWinners, setFinalWinners] = useState([]);
  const [finalStats, setFinalStats] = useState(null); // { rounds, marksMap, dartsMap, perfectsMap }
  const [playoffScores, setPlayoffScores] = useState({});
  const [playoffNumber, setPlayoffNumber] = useState(null);
  const [playoffCurrentIdx, setPlayoffCurrentIdx] = useState(0);
  const [legsWonMap, setLegsWonMap] = useState({});

  useEffect(() => {
    if (!loggedInUser) return;
    const heartbeat = () => refreshLoggedUserPresence(loggedInUser);
    heartbeat();
    const id = setInterval(heartbeat, 5000);
    window.addEventListener('beforeunload', heartbeat);
    window.addEventListener('pagehide', heartbeat);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', heartbeat);
      window.removeEventListener('pagehide', heartbeat);
    };
  }, [loggedInUser]);

  // Per-player stats accumulated during the current game for leaderboard recording
  // { [playerName]: { marks: number, darts: number, perfects: number } }
  const playerStatsRef = useRef({});

  const broadcastRef = useRef(null);

  // Sync game state across tabs/devices in the same room
  const { broadcast } = useGameSync(roomCode, useCallback((remoteGame) => {
    if (!remoteGame) return;

    setGame(prevGame => {
      let mergedGame = mergeGameState(prevGame, remoteGame);
      let needsBroadcast = false;

      if (prevGame && mergedGame && mergedGame.round > prevGame.round && mergedGame.view === 'scoring') {
        playNewRoundSound();
      }

      // Late Joiner / Rejoiner Logic:
      // If game is in progress and local user is logged in:
      if (loggedInUser && (mergedGame.view === 'scoring' || mergedGame.view === 'scoreboard') && Array.isArray(mergedGame.players)) {
        const existingIndex = mergedGame.players.findIndex(
          p => p.name?.trim().toLowerCase() === loggedInUser.trim().toLowerCase()
        );
        if (existingIndex < 0) {
          // New player joining mid-game: start at target 20 (targetIndex: 0) and allow current round play!
          const newPlayer = {
            name: loggedInUser,
            targetIndex: 0, // starts at 20!
            finished: false,
            finishedRound: null,
            roundCompleted: (mergedGame.round ?? 1) - 1, // allow immediate scoring in current round
            lastIsPerfect: false,
            perfectInRound: null,
            perfectCount: 0,
            marks: 0,
            darts: 0,
            legsWon: mergedGame.legsWonMap?.[loggedInUser] || 0,
          };
          mergedGame = {
            ...mergedGame,
            players: [...mergedGame.players, newPlayer],
          };
          needsBroadcast = true;
        }
      }

      if (mergedGame?.view) {
        setView(mergedGame.view);
        if (mergedGame.playoffPlayers) setPlayoffPlayers(mergedGame.playoffPlayers);
        if (mergedGame.playoffNumber !== undefined) setPlayoffNumber(mergedGame.playoffNumber);
        if (mergedGame.playoffScores) setPlayoffScores(mergedGame.playoffScores);
        if (mergedGame.playoffCurrentIdx !== undefined) setPlayoffCurrentIdx(mergedGame.playoffCurrentIdx);
        if (mergedGame.finalWinners) setFinalWinners(mergedGame.finalWinners);
        if (mergedGame.finalStats) setFinalStats(mergedGame.finalStats);
        if (mergedGame.legsWonMap) setLegsWonMap(mergedGame.legsWonMap);

        if (mergedGame.view === 'winner' && mergedGame.finalWinners?.length > 0) {
          playSound('win');
          recordGame(
            mergedGame.players,
            mergedGame.finalWinners,
            mergedGame.finalStats?.rounds ?? mergedGame.round ?? 1,
            mergedGame.finalStats?.marksMap ?? {},
            mergedGame.finalStats?.dartsMap ?? {},
            mergedGame.gameId
          );
        }
      }

      if (needsBroadcast) {
        setTimeout(() => broadcastRef.current?.(mergedGame), 0);
      }

      return mergedGame;
    });
  }, [loggedInUser]));

  broadcastRef.current = broadcast;

  // --- Lobby ---
  function handleCreateRoom() {
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    setMyPlayerName(loggedInUser);
    setView('room');
  }

  function handleJoinRoom(code) {
    setRoomCode(code);
    setIsHost(false);
    setMyPlayerName(loggedInUser);
    setView('room');
  }

  function handleSolo() {
    playerStatsRef.current = {};
    const newGame = createGame([loggedInUser ?? 'Solo Player']);
    setGame(newGame);
    setView('scoring');
  }

  // --- Room start ---
  function handleRoomStart(playerNames, keepLegs = false) {
    const currentLegs = keepLegs ? (game?.legsWonMap || legsWonMap) : {};
    const newGame = createGame(playerNames, currentLegs);
    setGame(newGame);
    if (!keepLegs) setLegsWonMap({});
    playerStatsRef.current = {};
    broadcast({ ...newGame, view: 'scoring' });
    setView('scoring');
  }


  // --- Turn complete: called when a player finishes all their darts ---
  const handleTurnComplete = useCallback((scoringPlayerIdx, newTargetIndex, allDarts, hitBull, isPerfect) => {
    setGame(prev => {
      if (!prev) return prev;
      const targetPlayer = prev.players[scoringPlayerIdx];
      if (!targetPlayer) return prev;

      const playerName = targetPlayer.name;

      // Accumulate per-player stats for leaderboard
      const prevMarks = targetPlayer.targetIndex;
      const marksThisTurn = newTargetIndex - prevMarks;
      const dartsThisTurn = allDarts ? allDarts.length : 0;
      const stats = playerStatsRef.current;
      stats[playerName] = {
        marks: (stats[playerName]?.marks ?? 0) + marksThisTurn,
        darts: (stats[playerName]?.darts ?? 0) + dartsThisTurn,
        perfects: (stats[playerName]?.perfects ?? 0) + (isPerfect ? 1 : 0),
      };

      // Update current player's progress — finished ONLY when actually hitting Bullseye
      const isFinished = hitBull;
      const players = prev.players.map((p, i) => {
        if (i !== scoringPlayerIdx) return p;
        return {
          ...p,
          targetIndex: newTargetIndex,
          finished: p.finished || isFinished,
          finishedRound: isFinished ? (p.finishedRound ?? prev.round) : p.finishedRound,
          roundCompleted: prev.round,
          lastIsPerfect: isPerfect,
          perfectInRound: isPerfect ? prev.round : null,
          perfectCount: (p.perfectCount || 0) + (isPerfect ? 1 : 0),
          marks: (p.marks ?? p.targetIndex) + marksThisTurn,
          darts: (p.darts || 0) + dartsThisTurn,
        };
      });

      // Advance currentPlayerIndex to next player on roster
      const nextPlayerIdx = (scoringPlayerIdx + 1) % players.length;

      // Check if ALL active players have completed the current round
      const roundJustEnded = players.every(p => p.finished || (p.roundCompleted ?? 0) >= prev.round);
      const newRound = roundJustEnded ? prev.round + 1 : prev.round;
      let advanced = { ...prev, players, currentPlayerIndex: nextPlayerIdx, round: newRound };

      let nextView = 'scoring';

      if (roundJustEnded) {
        const bullPlayers = players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.finished)
          .map(({ i }) => i);

        if (bullPlayers.length === 0) {
          playNewRoundSound();
        }

        if (bullPlayers.length === 1) {
          const winnerIdx = bullPlayers[0];
          const nextLegsWonMap = { ...(prev.legsWonMap || {}) };
          bullPlayers.forEach(i => {
            const wName = players[i].name;
            nextLegsWonMap[wName] = (nextLegsWonMap[wName] || 0) + 1;
          });
          setLegsWonMap(nextLegsWonMap);

          const updatedPlayers = players.map(p => ({
            ...p,
            legsWon: nextLegsWonMap[p.name] || 0,
          }));

          const marksMap = {};
          const dartsMap = {};
          const perfectsMap = {};
          updatedPlayers.forEach(p => {
            marksMap[p.name] = p.marks ?? p.targetIndex;
            dartsMap[p.name] = p.darts ?? 0;
            perfectsMap[p.name] = p.perfectCount ?? 0;
          });
          recordGame(updatedPlayers, [winnerIdx], prev.round, marksMap, dartsMap, prev.gameId);
          const fStats = { rounds: prev.round, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
          nextView = 'winner';
          setFinalWinners([winnerIdx]);
          setFinalStats(fStats);
          setPlayoffScores({});
          setPlayoffNumber(null);
          setView('winner');
          advanced = {
            ...advanced,
            players: updatedPlayers,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            legsWonMap: nextLegsWonMap,
            playoffScores: {},
            playoffNumber: null,
          };
        } else if (bullPlayers.length > 1) {
          const pNum = choosePlayoffNumber();
          nextView = 'playoff';
          setPlayoffPlayers(bullPlayers);
          setPlayoffScores({});
          setPlayoffNumber(pNum);
          setPlayoffCurrentIdx(0);
          setView('playoff');
          advanced = {
            ...advanced,
            view: 'playoff',
            playoffPlayers: bullPlayers,
            playoffNumber: pNum,
            playoffScores: {},
            playoffCurrentIdx: 0,
          };
        }
      }

      if (nextView === 'scoring') {
        setView('scoring');
        advanced = { ...advanced, view: 'scoring' };
      }

      setTimeout(() => broadcastRef.current?.(advanced), 0);
      return advanced;
    });
  }, []);

  const handlePlayoffComplete = useCallback((winners = [], scores = {}) => {
    const nextLegsWonMap = { ...(game.legsWonMap || legsWonMap) };
    winners.forEach(i => {
      const wName = game.players[i]?.name;
      if (wName) nextLegsWonMap[wName] = (nextLegsWonMap[wName] || 0) + 1;
    });
    setLegsWonMap(nextLegsWonMap);

    const updatedPlayers = game.players.map(p => ({
      ...p,
      legsWon: nextLegsWonMap[p.name] || 0,
    }));

    const marksMap = {};
    const dartsMap = {};
    const perfectsMap = {};
    updatedPlayers.forEach(p => {
      marksMap[p.name] = p.marks ?? p.targetIndex;
      dartsMap[p.name] = p.darts ?? 0;
      perfectsMap[p.name] = p.perfectCount ?? 0;
    });
    recordGame(updatedPlayers, winners, game.round, marksMap, dartsMap, game.gameId);

    const fStats = { rounds: game.round, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
    setFinalWinners(winners);
    setFinalStats(fStats);
    setPlayoffScores(scores);
    setView('winner');

    broadcast({
      ...game,
      players: updatedPlayers,
      view: 'winner',
      finalWinners: winners,
      finalStats: fStats,
      legsWonMap: nextLegsWonMap,
      playoffScores: scores,
    });
  }, [game, legsWonMap, broadcast]);

  const handlePlayoffUpdate = useCallback((newScores, newCurrentIdx) => {
    if (newScores) setPlayoffScores(newScores);
    if (typeof newCurrentIdx === 'number') setPlayoffCurrentIdx(newCurrentIdx);
    setGame(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        view: 'playoff',
        playoffScores: newScores ?? prev.playoffScores,
        playoffCurrentIdx: typeof newCurrentIdx === 'number' ? newCurrentIdx : (prev.playoffCurrentIdx ?? 0),
      };
      setTimeout(() => broadcast(updated), 0);
      return updated;
    });
  }, [broadcast]);

  const handlePlayoffTie = useCallback((tiedPlayers) => {
    const newNum = choosePlayoffNumber();
    setPlayoffPlayers(tiedPlayers);
    setPlayoffScores({});
    setPlayoffNumber(newNum);
    setPlayoffCurrentIdx(0);
    setView('playoff');
    setGame(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        view: 'playoff',
        playoffPlayers: tiedPlayers,
        playoffNumber: newNum,
        playoffScores: {},
        playoffCurrentIdx: 0,
      };
      setTimeout(() => broadcast(updated), 0);
      return updated;
    });
  }, [broadcast]);

  // --- Restart ---
  function handleRestart() {
    setGame(null);
    setFinalWinners([]);
    setFinalStats(null);
    setPlayoffScores({});
    setPlayoffNumber(null);
    setPlayoffPlayers([]);
    setRoomCode(null);
    setIsHost(false);
    setMyPlayerName(null);
    setLegsWonMap({});
    setView('lobby');
  }

  // ---- Render ----

  if (!loggedInUser) {
    return <AuthScreen onAuth={(name) => setLoggedInUser(name)} />;
  }

  if (view === 'lobby') {
    return (
      <Lobby
        userName={loggedInUser}
        onLogout={logout}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onSolo={handleSolo}
        onShowLeaderboard={() => setView('leaderboard')}
      />
    );
  }

  if (view === 'room') {
    return (
      <RoomLobby
        roomCode={roomCode}
        isHost={isHost}
        myPlayerName={myPlayerName}
        onStart={handleRoomStart}
        onLeave={() => { setRoomCode(null); setView('lobby'); }}
      />
    );
  }

  if (view === 'winner') {
    const winnerNames = finalWinners.map(i => game.players[i]?.name).filter(Boolean);
    const isPlayoff = Object.keys(playoffScores).length > 0;
    const winnerName = winnerNames[0] ?? 'Winner';
    const rounds = finalStats?.rounds ?? game.round;
    const winnerMarks = finalStats?.marksMap?.[winnerName] ?? BULL_INDEX;
    const winnerPerfects = finalStats?.perfectsMap?.[winnerName] ?? 0;
    const mpr = rounds > 0 ? (winnerMarks / rounds).toFixed(2) : '—';
    return (
      <div className="screen">
        <div className="winner-screen">
          <div className="trophy">🏆</div>
          <h1>{winnerNames.join(' & ')} wins!</h1>
          <p>
            {isPlayoff
              ? `Playoff winner with ${playoffScores[finalWinners[0]]} hit${playoffScores[finalWinners[0]] !== 1 ? 's' : ''}!`
              : 'Closed on the Bullseye!'}
          </p>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Final Player Results</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {game.players.map((p, idx) => {
              const pMarks = finalStats?.marksMap?.[p.name] ?? p.targetIndex;
              const pPerfects = finalStats?.perfectsMap?.[p.name] ?? p.perfectCount ?? 0;
              const pLegs = p.legsWon ?? finalStats?.legsWonMap?.[p.name] ?? legsWonMap[p.name] ?? 0;
              const pMpr = rounds > 0 ? (pMarks / rounds).toFixed(2) : '—';
              const isWinner = finalWinners.includes(idx);
              return (
                <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'var(--surface2)', borderRadius: '10px', border: isWinner ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: isWinner ? 'var(--accent)' : 'var(--text)' }}>
                      {isWinner ? '🏆 ' : ''}{p.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {pMpr} MPR
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                    <span style={{ color: 'var(--accent2)', fontWeight: 800, fontSize: '0.95rem' }}>
                      {pPerfects > 0 ? `✨ ${pPerfects} Perfect${pPerfects > 1 ? 's' : ''}` : '0 Perfects'}
                    </span>
                    <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.05rem' }}>
                      🏆 {pLegs} Leg{pLegs !== 1 ? 's' : ''} Won
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isPlayoff && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: '0.5rem' }}>Playoff Scores</p>
            {Object.entries(playoffScores)
              .sort((a, b) => b[1] - a[1])
              .map(([pi, sc]) => (
                <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{game.players[pi]?.name}</span>
                  <strong style={{ color: 'var(--accent)' }}>{sc}</strong>
                </div>
              ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', width: '100%' }}>
          <button className="btn-primary" onClick={handleRestart}>
            🏠 Exit to Main Lobby
          </button>
          <button className="btn-secondary" onClick={() => setView('leaderboard')}>
            🏆 View Leaderboard & Stats
          </button>
          <button className="btn-secondary" onClick={() => {
            const playerNames = game.players.map(p => p.name);
            handleRoomStart(playerNames, true);
          }}>
            🎯 Rematch / Play Again
          </button>
        </div>
      </div>
    );
  }

  if (view === 'leaderboard') {
    return <LeaderboardView onClose={() => setView(game?.players ? 'winner' : 'lobby')} />;
  }

  if (view === 'playoff') {
    return (
      <PlayoffScreen
        game={game}
        playoffPlayers={playoffPlayers}
        playoffNumber={playoffNumber}
        playoffScores={playoffScores}
        playoffCurrentIdx={playoffCurrentIdx}
        myPlayerName={myPlayerName}
        onPlayoffComplete={handlePlayoffComplete}
        onPlayoffUpdate={handlePlayoffUpdate}
        onPlayoffTie={handlePlayoffTie}
      />
    );
  }

  if (view === 'scoreboard') {
    return <Scoreboard game={game} roomCode={roomCode} onClose={() => setView('scoring')} />;
  }

  // scoring view — select active player based on myPlayerName or currentPlayerIndex
  const matchedIdx = myPlayerName
    ? game.players.findIndex(p => p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : -1;
  const activeIdx = matchedIdx >= 0 ? matchedIdx : (game.currentPlayerIndex ?? 0);
  const activePlayer = game.players[activeIdx] || game.players[0];

  return (
    <ScoringScreen
      key={`scoring-${activeIdx}-${game.round}`}
      game={game}
      player={activePlayer}
      playerIndex={activeIdx}
      myPlayerName={myPlayerName}
      roomCode={roomCode}
      onTurnComplete={handleTurnComplete}
      onShowScoreboard={() => setView('scoreboard')}
      onQuit={handleRestart}
    />
  );
}
