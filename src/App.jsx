import { useState, useCallback } from 'react';
import './index.css';

import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';

import { createGame } from './gameLogic.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
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
  const [game, setGame] = useState(null);
  const [view, setView] = useState('lobby'); // 'lobby' | 'room' | 'scoring' | 'scoreboard' | 'playoff' | 'winner'
  const [roomCode, setRoomCode] = useState(null);
  const [playoffPlayers, setPlayoffPlayers] = useState([]);
  const [finalWinners, setFinalWinners] = useState([]);
  const [playoffScores, setPlayoffScores] = useState({});

  // --- Lobby ---
  function handleCreateRoom() {
    const code = generateRoomCode();
    setRoomCode(code);
    setView('room');
  }

  function handleJoinRoom(code) {
    setRoomCode(code);
    setView('room');
  }

  function handleSolo() {
    setGame(createGame(['Solo Player']));
    setView('scoring');
  }

  // --- Room start ---
  function handleRoomStart(playerNames) {
    setGame(createGame(playerNames));
    setView('scoring');
  }


  // --- Turn complete: called when a player finishes all their darts ---
  const handleTurnComplete = useCallback((newTargetIndex, _allDarts, hitBull) => {
    setGame(prev => {
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
          // Sole winner — schedule view change after state settles
          setTimeout(() => {
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

      return advanced;
    });

    setView('scoring');
  }, []);

  // --- Playoff complete ---
  function handlePlayoffComplete(winners, scores) {
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
    setView('lobby');
  }

  // ---- Render ----

  if (view === 'lobby') {
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} onSolo={handleSolo} />;
  }

  if (view === 'room') {
    return (
      <RoomLobby
        roomCode={roomCode}
        onStart={handleRoomStart}
        onLeave={() => { setRoomCode(null); setView('lobby'); }}
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
      onTurnComplete={handleTurnComplete}
      onShowScoreboard={() => setView('scoreboard')}
      onQuit={handleRestart}
    />
  );
}
