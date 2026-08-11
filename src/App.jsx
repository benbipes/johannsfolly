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
import { getLoggedInUser, logout, refreshLoggedUserPresence, clearPresenceOnUnload } from './auth.js';
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
    const id = setInterval(heartbeat, 10000);
    const handleUnload = () => clearPresenceOnUnload();
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [loggedInUser]);

  // Per-player stats accumulated during the current game for leaderboard recording
  // { [playerName]: { marks: number, darts: number, perfects: number } }
  const playerStatsRef = useRef({});

  // Sync game state across tabs/devices in the same room
  const { broadcast } = useGameSync(roomCode, useCallback((remoteGame) => {
    setGame(remoteGame);
    setView('scoring');
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
    setGame(createGame([loggedInUser ?? 'Solo Player']));
    setView('scoring');
  }

  // --- Room start ---
  function handleRoomStart(playerNames) {
    const newGame = createGame(playerNames);
    setGame(newGame);
    playerStatsRef.current = {};
    broadcast(newGame);
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
      const reachedBullThisTurn = prevMarks < BULL_INDEX && newTargetIndex === BULL_INDEX;

      // Update current player's progress
      const players = prev.players.map((p, i) => {
        if (i !== prev.currentPlayerIndex) return p;
        return {
          ...p,
          targetIndex: newTargetIndex,
          finished: hitBull,
          finishedRound: hitBull ? prev.round : p.finishedRound,
        };
      });

      // Advance to next player
      const nextIdx = (prev.currentPlayerIndex + 1) % players.length;
      const newRound = nextIdx === 0 ? prev.round + 1 : prev.round;
      const advanced = { ...prev, players, currentPlayerIndex: nextIdx, round: newRound };

      const bullPlayers = players
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.targetIndex === BULL_INDEX)
        .map(({ i }) => i);

      if ((reachedBullThisTurn || hitBull) && bullPlayers.length > 1) {
        setTimeout(() => {
          setPlayoffPlayers(bullPlayers);
          setPlayoffScores({});
          setPlayoffNumber(choosePlayoffNumber());
          setView('playoff');
        }, 0);
      } else if (hitBull) {
        const marksMap = {};
        const dartsMap = {};
        const perfectsMap = {};
        players.forEach(p => {
          marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
          dartsMap[p.name] = stats[p.name]?.darts ?? 0;
          perfectsMap[p.name] = stats[p.name]?.perfects ?? 0;
        });
        setTimeout(() => {
          recordGame(players, [prev.currentPlayerIndex], prev.round, marksMap, dartsMap);
          setFinalWinners([prev.currentPlayerIndex]);
          setFinalStats({ rounds: prev.round, marksMap, dartsMap, perfectsMap });
          setPlayoffScores({});
          setPlayoffNumber(null);
          setView('winner');
        }, 0);
      }

      // Did the round just complete?
      const roundJustEnded = nextIdx === 0;

      if (!hitBull && bullPlayers.length < 2 && roundJustEnded) {
        // Collect all players who hit bull this round
        const hitters = players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.finished && p.finishedRound === prev.round)
          .map(({ i }) => i);

        if (hitters.length === 1) {
          // Sole winner — record stats and schedule view change
          const marksMap = {};
          const dartsMap = {};
          const perfectsMap = {};
          players.forEach(p => {
            marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
            dartsMap[p.name] = stats[p.name]?.darts ?? 0;
            perfectsMap[p.name] = stats[p.name]?.perfects ?? 0;
          });
          setTimeout(() => {
            recordGame(players, hitters, prev.round, marksMap, dartsMap);
            setFinalWinners(hitters);
            setFinalStats({ rounds: prev.round, marksMap, dartsMap, perfectsMap });
            setPlayoffNumber(null);
            setView('winner');
          }, 0);
        } else if (hitters.length > 1) {
          setTimeout(() => {
            setPlayoffPlayers(hitters);
            setPlayoffScores({});
            setPlayoffNumber(choosePlayoffNumber());
            setView('playoff');
          }, 0);
        }
      }

      // Broadcast the advanced state to other devices in the room
      setTimeout(() => broadcast(advanced), 0);

      return advanced;
    });

    setView('scoring');
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

    setFinalWinners(winners);
    setFinalStats({ rounds: game.round, marksMap, dartsMap, perfectsMap });
    setPlayoffScores(scores);
    setView('winner');
  }

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

        <Scoreboard game={game} />

        <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleRestart}>
          New Game
        </button>
      </div>
    );
  }

  if (view === 'scoreboard') {
    return <Scoreboard game={game} onClose={() => setView('scoring')} />;
  }

  if (view === 'playoff') {
    return (
      <PlayoffScreen
        game={game}
        playoffPlayers={playoffPlayers}
        playoffNumber={playoffNumber}
        onPlayoffComplete={handlePlayoffComplete}
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
    // State drifted — sync up (this handles the case where we come back
    // from scoreboard view and the current player index needs adjusting)
    setGame(g);
  }

  // All players finished; winner/playoff view transition is pending via setTimeout
  if (g.players[g.currentPlayerIndex].finished) {
    return null;
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
