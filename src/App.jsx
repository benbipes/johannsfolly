import { useState, useCallback, useRef } from 'react';
import './index.css';

import AuthScreen from './components/AuthScreen.jsx';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';
import LeaderboardView from './components/Leaderboard.jsx';

import { createGame } from './gameLogic.js';
import { useGameSync } from './useGameSync.js';
import { getLoggedInUser, logout } from './auth.js';
import { recordGame } from './leaderboard.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
  const [playoffScores, setPlayoffScores] = useState({});

  // Per-player stats accumulated during the current game for leaderboard recording
  // { [playerName]: { marks: number, darts: number } }
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
  const handleTurnComplete = useCallback((newTargetIndex, allDarts, hitBull) => {
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
      };

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

      // Did the round just complete?
      const roundJustEnded = nextIdx === 0;

      if (roundJustEnded) {
        // Collect all players who hit bull this round
        const hitters = players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.finished && p.finishedRound === prev.round)
          .map(({ i }) => i);

        if (hitters.length === 1) {
          // Sole winner — record stats and schedule view change
          const marksMap = {};
          const dartsMap = {};
          players.forEach(p => {
            marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
            dartsMap[p.name] = stats[p.name]?.darts ?? 0;
          });
          setTimeout(() => {
            recordGame(players, hitters, prev.round, marksMap, dartsMap);
            setFinalWinners(hitters);
            setView('winner');
          }, 0);
        } else if (hitters.length > 1) {
          setTimeout(() => {
            setPlayoffPlayers(hitters);
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
    const stats = playerStatsRef.current;
    game.players.forEach(p => {
      marksMap[p.name] = stats[p.name]?.marks ?? p.targetIndex;
      dartsMap[p.name] = stats[p.name]?.darts ?? 0;
    });
    recordGame(game.players, winners, game.round, marksMap, dartsMap);

    setFinalWinners(winners);
    setPlayoffScores(scores);
    setView('winner');
  }

  // --- Restart ---
  function handleRestart() {
    setGame(null);
    setFinalWinners([]);
    setPlayoffScores({});
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
    return (
      <div className="screen">
        <div className="winner-screen">
          <div className="trophy">🏆</div>
          <h1>{winnerNames.join(' & ')} wins!</h1>
          <p>
            {isPlayoff
              ? `Playoff winner with ${playoffScores[finalWinners[0]]} hit${playoffScores[finalWinners[0]] !== 1 ? 's' : ''}!`
              : 'First to reach the Bullseye!'}
          </p>
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
        onPlayoffComplete={handlePlayoffComplete}
      />
    );
  }

  // scoring view — skip finished players automatically
  let g = game;
  while (g.players[g.currentPlayerIndex].finished) {
    g = advanceGame(g);
  }
  if (g !== game) {
    // State drifted — sync up (this handles the case where we come back
    // from scoreboard view and the current player index needs adjusting)
    setGame(g);
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
