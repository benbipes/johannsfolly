import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';

import AuthScreen from './components/AuthScreen.jsx';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';
import LeaderboardView from './components/Leaderboard.jsx';

import { BULL_INDEX, createGame } from './gameLogic.js';
import { useGameSync } from './useGameSync.js';
import { getLoggedInUser, logout, refreshLoggedUserPresence } from './auth.js';
import { recordGame } from './leaderboard.js';

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

  // Sync game state across tabs/devices in the same room
  const { broadcast } = useGameSync(roomCode, useCallback((remoteGame) => {
    setGame(remoteGame);
    if (remoteGame?.view) {
      setView(remoteGame.view);
      if (remoteGame.playoffPlayers) setPlayoffPlayers(remoteGame.playoffPlayers);
      if (remoteGame.playoffNumber !== undefined) setPlayoffNumber(remoteGame.playoffNumber);
      if (remoteGame.playoffScores) setPlayoffScores(remoteGame.playoffScores);
      if (remoteGame.finalWinners) setFinalWinners(remoteGame.finalWinners);
      if (remoteGame.finalStats) setFinalStats(remoteGame.finalStats);
    }
  }, []));

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
  function handleRoomStart(playerNames) {
    const newGame = createGame(playerNames);
    setGame(newGame);
    playerStatsRef.current = {};
    broadcast({ ...newGame, view: 'scoring' });
    setView('scoring');
  }


  // --- Turn complete: called when a player finishes all their darts ---
  const handleTurnComplete = useCallback((newTargetIndex, allDarts, hitBull, isPerfect) => {
    setGame(prev => {
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      const playerName = currentPlayer.name;

      // Accumulate per-player stats for leaderboard
      const prevMarks = currentPlayer.targetIndex;
      const marksThisTurn = newTargetIndex - prevMarks;
      const dartsThisTurn = allDarts ? allDarts.length : 0;
      const stats = playerStatsRef.current;
      stats[playerName] = {
        marks: (stats[playerName]?.marks ?? 0) + marksThisTurn,
        darts: (stats[playerName]?.darts ?? 0) + dartsThisTurn,
        perfects: (stats[playerName]?.perfects ?? 0) + (isPerfect ? 1 : 0),
      };

      // Update current player's progress
      const isFinished = hitBull || newTargetIndex === BULL_INDEX;
      const players = prev.players.map((p, i) => {
        if (i !== prev.currentPlayerIndex) return p;
        return {
          ...p,
          targetIndex: newTargetIndex,
          finished: p.finished || isFinished,
          finishedRound: isFinished ? (p.finishedRound ?? prev.round) : p.finishedRound,
        };
      });

      // Advance to next player
      const nextIdx = (prev.currentPlayerIndex + 1) % players.length;
      const roundJustEnded = nextIdx === 0;
      const newRound = roundJustEnded ? prev.round + 1 : prev.round;
      let advanced = { ...prev, players, currentPlayerIndex: nextIdx, round: newRound };

      let nextView = 'scoring';

      // Evaluate winner / tie playoff ONLY when the full round has completed
      if (roundJustEnded) {
        const bullPlayers = players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.targetIndex === BULL_INDEX || p.finished)
          .map(({ i }) => i);

        if (bullPlayers.length === 1) {
          // Sole winner at the end of the round
          const winnerIdx = bullPlayers[0];
          const marksMap = {};
          const dartsMap = {};
          const perfectsMap = {};
          players.forEach(p => {
            marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
            dartsMap[p.name] = stats[p.name]?.darts ?? 0;
            perfectsMap[p.name] = stats[p.name]?.perfects ?? 0;
          });
          recordGame(players, [winnerIdx], prev.round, marksMap, dartsMap);
          const fStats = { rounds: prev.round, marksMap, dartsMap, perfectsMap };
          nextView = 'winner';
          setFinalWinners([winnerIdx]);
          setFinalStats(fStats);
          setPlayoffScores({});
          setPlayoffNumber(null);
          setView('winner');
          advanced = {
            ...advanced,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            playoffScores: {},
            playoffNumber: null,
          };
        } else if (bullPlayers.length > 1) {
          // Multiple players reached Bull by end of round -> Playoff tiebreaker!
          const pNum = choosePlayoffNumber();
          nextView = 'playoff';
          setPlayoffPlayers(bullPlayers);
          setPlayoffScores({});
          setPlayoffNumber(pNum);
          setView('playoff');
          advanced = {
            ...advanced,
            view: 'playoff',
            playoffPlayers: bullPlayers,
            playoffNumber: pNum,
            playoffScores: {},
          };
        }
      }

      if (nextView === 'scoring') {
        setView('scoring');
        advanced = { ...advanced, view: 'scoring' };
      }

      setTimeout(() => broadcast(advanced), 0);
      return advanced;
    });
  }, [broadcast]);

  // --- Playoff complete ---
  function handlePlayoffComplete(winners, scores) {
    // Record the game result after playoff
    const marksMap = {};
    const dartsMap = {};
    const perfectsMap = {};
    const stats = playerStatsRef.current;
    game.players.forEach(p => {
      marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
      dartsMap[p.name] = stats[p.name]?.darts ?? 0;
      perfectsMap[p.name] = stats[p.name]?.perfects ?? 0;
    });
    recordGame(game.players, winners, game.round, marksMap, dartsMap);

    const fStats = { rounds: game.round, marksMap, dartsMap, perfectsMap };
    setFinalWinners(winners);
    setFinalStats(fStats);
    setPlayoffScores(scores);
    setView('winner');

    broadcast({
      ...game,
      view: 'winner',
      finalWinners: winners,
      finalStats: fStats,
      playoffScores: scores,
    });
  }

  const handlePlayoffUpdate = useCallback((newScores) => {
    setPlayoffScores(newScores);
    setGame(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        view: 'playoff',
        playoffScores: newScores,
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
    setView('lobby');
  }

  // ---- Render ----

  if (!loggedInUser) {
    return <AuthScreen onAuth={(name) => setLoggedInUser(name)} />;
  }

  if (view === 'lobby') {
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} onSolo={handleSolo} loggedInUser={loggedInUser} onLogout={() => { logout(); setLoggedInUser(null); }} onShowLeaderboard={() => setView('leaderboard')} />;
  }

  if (view === 'leaderboard') {
    return <LeaderboardView onClose={() => setView('lobby')} />;
  }

  if (view === 'room') {
    return (
      <RoomLobby
        roomCode={roomCode}
        isHost={isHost}
        myPlayerName={myPlayerName}
        onStart={handleRoomStart}
        onLeave={() => { setRoomCode(null); setIsHost(false); setMyPlayerName(null); setView('lobby'); }}
      />
    );
  }

  if (view === 'winner') {
    const winnerNames = finalWinners.map(i => game.players[i].name);
    const isPlayoff = Object.keys(playoffScores).length > 0;
    const winnerName = winnerNames[0];
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
          <p className="section-title" style={{ marginBottom: '0.5rem' }}>Game Results — {winnerName}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>Rounds taken</span>
            <strong style={{ color: 'var(--accent)' }}>{rounds}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>MPR (marks per round)</span>
            <strong style={{ color: 'var(--accent)' }}>{mpr}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>Perfect throws</span>
            <strong style={{ color: 'var(--accent2)' }}>{winnerPerfects}</strong>
          </div>
        </div>

        {isPlayoff && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: '0.5rem' }}>Playoff Scores</p>
            {Object.entries(playoffScores)
              .sort((a, b) => b[1] - a[1])
              .map(([pi, sc]) => (
                <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{game.players[pi].name}</span>
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
            handleRoomStart(playerNames);
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
        myPlayerName={myPlayerName}
        onPlayoffComplete={handlePlayoffComplete}
        onPlayoffUpdate={handlePlayoffUpdate}
      />
    );
  }

  // scoring view — skip finished players automatically
  let g = game;
  let skipCount = 0;
  while (g.players[g.currentPlayerIndex].finished && skipCount < g.players.length) {
    g = advanceGame(g);
    skipCount++;
  }
  if (g !== game && !g.players[g.currentPlayerIndex].finished) {
    setGame(g);
  }

  // All players finished; winner/playoff view transition is active or pending
  if (g.players[g.currentPlayerIndex].finished) {
    if (view === 'playoff') {
      return (
        <PlayoffScreen
          game={game}
          playoffPlayers={playoffPlayers}
          playoffNumber={playoffNumber}
          playoffScores={playoffScores}
          myPlayerName={myPlayerName}
          onPlayoffComplete={handlePlayoffComplete}
          onPlayoffUpdate={handlePlayoffUpdate}
        />
      );
    }
    return (
      <div className="screen">
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <h2>Game Complete!</h2>
          <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Loading results…</p>
        </div>
      </div>
    );
  }

  const currentPlayer = g.players[g.currentPlayerIndex];

  return (
    <ScoringScreen
      key={`${g.currentPlayerIndex}-${g.round}`}
      game={g}
      player={currentPlayer}
      playerIndex={g.currentPlayerIndex}
      myPlayerName={myPlayerName}
      onTurnComplete={handleTurnComplete}
      onShowScoreboard={() => setView('scoreboard')}
      onQuit={handleRestart}
    />
  );
}
