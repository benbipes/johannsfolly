import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';

import AuthScreen from './components/AuthScreen.jsx';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';
import LeaderboardView from './components/Leaderboard.jsx';

import { createGame, mergeGameState, getPlayerMarks } from './gameLogic.js';
import { useGameSync } from './useGameSync.js';
import { getLoggedInUser, logout, deleteAccount, refreshLoggedUserPresence } from './auth.js';
import { recordGame } from './leaderboard.js';
import { playNewRoundSound, reunlockAllAudio } from './audio.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function choosePlayoffNumber() {
  return Math.floor(Math.random() * 20) + 1;
}

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState(() => getLoggedInUser());
  const [roomCode, setRoomCode] = useState(() => {
    try { return sessionStorage.getItem('jf:active_roomCode') || null; } catch { return null; }
  });
  const [myPlayerName, setMyPlayerName] = useState(() => {
    try { return sessionStorage.getItem('jf:active_playerName') || loggedInUser; } catch { return loggedInUser; }
  });
  const [view, setView] = useState(() => {
    try { return sessionStorage.getItem('jf:active_view') || 'lobby'; } catch { return 'lobby'; }
  });
  const [game, setGame] = useState(() => {
    try {
      const code = sessionStorage.getItem('jf:active_roomCode');
      if (code) {
        const stored = localStorage.getItem(`game:${code}`);
        if (stored) return JSON.parse(stored);
      }
    } catch { /* ignore */ }
    return null;
  });

  const [isHost, setIsHost] = useState(false);
  const [playoffPlayers, setPlayoffPlayers] = useState([]);
  const [finalWinners, setFinalWinners] = useState([]);
  const [finalStats, setFinalStats] = useState(null); // { rounds, marksMap, dartsMap, perfectsMap }
  const [playoffScores, setPlayoffScores] = useState({});
  const [playoffSubmitted, setPlayoffSubmitted] = useState({});
  const [playoffNumber, setPlayoffNumber] = useState(null);
  const [playoffStyle, setPlayoffStyle] = useState(null);
  const [playoffRound, setPlayoffRound] = useState(1);
  const [legsWonMap, setLegsWonMap] = useState({});
  const [splashRound, setSplashRound] = useState(null);
  const splashTimerRef = useRef(null);

  const triggerRoundSplash = useCallback((roundNum) => {
    setSplashRound(roundNum);
    if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    splashTimerRef.current = setTimeout(() => {
      setSplashRound(null);
    }, 2000);
  }, []);

  // Check URL query params for manual cache reset (?reset=1 or ?clear=1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('reset') || params.has('clear')) {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = window.location.origin + window.location.pathname;
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Session persistence for page refresh recovery
  useEffect(() => {
    try {
      if (roomCode) {
        sessionStorage.setItem('jf:active_roomCode', roomCode);
      } else {
        sessionStorage.removeItem('jf:active_roomCode');
      }
      if (myPlayerName) {
        sessionStorage.setItem('jf:active_playerName', myPlayerName);
      } else {
        sessionStorage.removeItem('jf:active_playerName');
      }
      if (view && view !== 'lobby') {
        sessionStorage.setItem('jf:active_view', view);
      } else {
        sessionStorage.removeItem('jf:active_view');
      }
    } catch { /* ignore */ }
  }, [roomCode, myPlayerName, view]);

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
  const { broadcast, forceSync } = useGameSync(roomCode, useCallback((remoteGame) => {
    if (!remoteGame) return;

    setGame(prevGame => {
      let mergedGame = mergeGameState(prevGame, remoteGame);
      let needsBroadcast = false;

      if (prevGame && mergedGame && mergedGame.round > prevGame.round && mergedGame.view === 'scoring') {
        playNewRoundSound();
        triggerRoundSplash(mergedGame.round);
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

      const isNewGame = prevGame && mergedGame.gameId !== prevGame.gameId;
      if (isNewGame) {
        playerStatsRef.current = {};
        setPlayoffPlayers([]);
        setPlayoffScores({});
        setPlayoffSubmitted({});
        setPlayoffNumber(null);
        setPlayoffStyle(null);
        setPlayoffRound(1);
        setFinalWinners([]);
        setFinalStats(null);
      }

      if (mergedGame?.view) {
        setView(mergedGame.view);
        if (mergedGame.playoffPlayers) setPlayoffPlayers(mergedGame.playoffPlayers);
        if (mergedGame.playoffStyle !== undefined) setPlayoffStyle(mergedGame.playoffStyle);
        if (mergedGame.playoffNumber !== undefined) setPlayoffNumber(mergedGame.playoffNumber);
        if (mergedGame.playoffScores) setPlayoffScores(mergedGame.playoffScores);
        if (mergedGame.playoffSubmitted) setPlayoffSubmitted(mergedGame.playoffSubmitted);
        if (mergedGame.playoffRound !== undefined) setPlayoffRound(mergedGame.playoffRound);
        if (mergedGame.finalWinners) setFinalWinners(mergedGame.finalWinners);
        if (mergedGame.finalStats) setFinalStats(mergedGame.finalStats);
        if (mergedGame.legsWonMap) setLegsWonMap(mergedGame.legsWonMap);

        if (mergedGame.view === 'winner' && mergedGame.finalWinners?.length > 0) {
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

  function handleSolo(tieBreaker = 'playoff') {
    reunlockAllAudio();
    playerStatsRef.current = {};
    const newGame = createGame([loggedInUser ?? 'Solo Player'], {}, tieBreaker);
    setGame(newGame);
    setPlayoffPlayers([]);
    setFinalWinners([]);
    setFinalStats(null);
    setPlayoffScores({});
    setPlayoffSubmitted({});
    setPlayoffNumber(null);
    setPlayoffStyle(null);
    setPlayoffRound(1);
    setView('scoring');
  }

  // --- Room start ---
  function handleRoomStart(playerNames, keepLegs = false, tieBreaker = 'playoff') {
    reunlockAllAudio();
    const currentLegs = keepLegs ? (game?.legsWonMap || legsWonMap) : {};
    const rule = tieBreaker || game?.tieBreaker || 'playoff';
    const newGame = createGame(playerNames, currentLegs, rule);
    setGame(newGame);
    if (!keepLegs) setLegsWonMap({});
    playerStatsRef.current = {};
    setPlayoffPlayers([]);
    setFinalWinners([]);
    setFinalStats(null);
    setPlayoffScores({});
    setPlayoffSubmitted({});
    setPlayoffNumber(null);
    setPlayoffStyle(null);
    setPlayoffRound(1);
    broadcast({ ...newGame, view: 'scoring' });
    setView('scoring');
  }


  // --- Turn complete: called when a player finishes all their darts ---
  const handleTurnComplete = useCallback((scoringPlayerIdx, newTargetIndex, allDarts, hitBull, isPerfect, soundDelayMs = 0, bullsHit = 0) => {
    setGame(prev => {
      if (!prev) return prev;
      const targetPlayer = prev.players[scoringPlayerIdx];
      if (!targetPlayer) return prev;

      const playerName = targetPlayer.name;

      // Accumulate per-player stats for leaderboard
      const isFinished = hitBull || Boolean(targetPlayer.finished);
      const newMarks = newTargetIndex + (isFinished ? 1 : 0);
      const prevMarks = getPlayerMarks(targetPlayer);
      const marksThisTurn = Math.max(0, newMarks - prevMarks);
      const dartsThisTurn = allDarts ? allDarts.length : 0;
      const stats = playerStatsRef.current;
      stats[playerName] = {
        marks: (stats[playerName]?.marks ?? 0) + marksThisTurn,
        darts: (stats[playerName]?.darts ?? 0) + dartsThisTurn,
        perfects: (stats[playerName]?.perfects ?? 0) + (isPerfect ? 1 : 0),
      };

      // Update current player's progress — finished ONLY when actually hitting Bullseye
      const players = prev.players.map((p, i) => {
        if (i !== scoringPlayerIdx) return p;
        const playerFinished = p.finished || isFinished;
        const playerMarks = newTargetIndex + (playerFinished ? 1 : 0);
        return {
          ...p,
          targetIndex: newTargetIndex,
          finished: playerFinished,
          finishedRound: isFinished ? (p.finishedRound ?? prev.round) : p.finishedRound,
          roundCompleted: prev.round,
          lastIsPerfect: isPerfect,
          perfectInRound: isPerfect ? prev.round : null,
          perfectCount: (p.perfectCount || 0) + (isPerfect ? 1 : 0),
          marks: playerMarks,
          darts: (p.darts || 0) + dartsThisTurn,
          bullsHit: (p.bullsHit || 0) + bullsHit,
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
          const triggerNextRound = () => {
            playNewRoundSound();
            triggerRoundSplash(newRound);
          };
          if (soundDelayMs > 0) {
            setTimeout(triggerNextRound, soundDelayMs);
          } else {
            triggerNextRound();
          }
        }

        if (bullPlayers.length === 1) {
          const winnerIdx = bullPlayers[0];
          const nextLegsWonMap = { ...prev.legsWonMap };
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
            marksMap[p.name] = getPlayerMarks(p);
            dartsMap[p.name] = p.darts ?? 0;
            perfectsMap[p.name] = p.perfectCount ?? 0;
          });
          recordGame(updatedPlayers, [winnerIdx], prev.round, marksMap, dartsMap, prev.gameId);
          const fStats = { rounds: prev.round, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
          nextView = 'winner';
          setFinalWinners([winnerIdx]);
          setFinalStats(fStats);
          setPlayoffScores({});
          setPlayoffSubmitted({});
          setPlayoffNumber(null);
          setPlayoffRound(1);
          setView('winner');
          advanced = {
            ...advanced,
            players: updatedPlayers,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            legsWonMap: nextLegsWonMap,
            playoffScores: {},
            playoffSubmitted: {},
            playoffNumber: null,
            playoffRound: 1,
          };
        } else if (bullPlayers.length > 1) {
          // Reached playoff! Allow players involved to choose playoff style (random number or add-up bulls)
          nextView = 'playoff';
          setPlayoffPlayers(bullPlayers);
          setPlayoffScores({});
          setPlayoffSubmitted({});
          setPlayoffNumber(null);
          setPlayoffStyle(null);
          setPlayoffRound(1);
          setView('playoff');
          advanced = {
            ...advanced,
            view: 'playoff',
            playoffPlayers: bullPlayers,
            playoffStyle: null,
            playoffNumber: null,
            playoffScores: {},
            playoffSubmitted: {},
            playoffRound: 1,
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

  const handleChoosePlayoffStyle = useCallback((style) => {
    const pNum = style === 'bulls' ? 'Bull' : choosePlayoffNumber();
    setPlayoffStyle(style);
    setPlayoffNumber(pNum);
    setGame(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        playoffStyle: style,
        playoffNumber: pNum,
      };
      setTimeout(() => broadcastRef.current?.(updated), 0);
      return updated;
    });
  }, []);

  const handlePlayoffSubmit = useCallback((scoringPlayerIdx, score) => {
    setGame(prev => {
      if (!prev) return prev;
      const nextScores = { ...prev.playoffScores, [scoringPlayerIdx]: score };
      const nextSubmitted = { ...prev.playoffSubmitted, [scoringPlayerIdx]: true };
      setPlayoffScores(nextScores);
      setPlayoffSubmitted(nextSubmitted);

      const updated = {
        ...prev,
        playoffScores: nextScores,
        playoffSubmitted: nextSubmitted,
      };

      const participants = updated.playoffPlayers || [];
      const allDone = participants.length > 0 && participants.every(pi => nextSubmitted[pi]);

      if (allDone) {
        const scoresArr = participants.map(pi => nextScores[pi] ?? 0);
        const maxScore = Math.max(...scoresArr);
        const winners = participants.filter(pi => (nextScores[pi] ?? 0) === maxScore);

        if (winners.length === 1) {
          const winnerIdx = winners[0];
          const nextLegsWonMap = { ...updated.legsWonMap };
          const wName = updated.players[winnerIdx]?.name;
          if (wName) nextLegsWonMap[wName] = (nextLegsWonMap[wName] || 0) + 1;
          setLegsWonMap(nextLegsWonMap);

          const updatedPlayers = updated.players.map(p => ({
            ...p,
            legsWon: nextLegsWonMap[p.name] || 0,
          }));

          const marksMap = {};
          const dartsMap = {};
          const perfectsMap = {};
          updatedPlayers.forEach(p => {
            marksMap[p.name] = getPlayerMarks(p);
            dartsMap[p.name] = p.darts ?? 0;
            perfectsMap[p.name] = p.perfectCount ?? 0;
          });
          recordGame(updatedPlayers, [winnerIdx], updated.round, marksMap, dartsMap, updated.gameId);

          const fStats = { rounds: updated.round, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
          setFinalWinners([winnerIdx]);
          setFinalStats(fStats);
          setView('winner');

          const winnerGame = {
            ...updated,
            players: updatedPlayers,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            legsWonMap: nextLegsWonMap,
            playoffScores: nextScores,
          };
          setTimeout(() => broadcastRef.current?.(winnerGame), 0);
          return winnerGame;
        } else if (winners.length > 1) {
          const activeStyle = updated.playoffStyle || playoffStyle;
          const nextNum = activeStyle === 'bulls' ? 'Bull' : choosePlayoffNumber();
          const nextRound = (updated.playoffRound || 1) + 1;
          setPlayoffNumber(nextNum);
          setPlayoffPlayers(winners);
          setPlayoffScores({});
          setPlayoffSubmitted({});
          setPlayoffRound(nextRound);
          setView('playoff');

          const tiedGame = {
            ...updated,
            view: 'playoff',
            playoffStyle: activeStyle,
            playoffNumber: nextNum,
            playoffPlayers: winners,
            playoffScores: {},
            playoffSubmitted: {},
            playoffRound: nextRound,
          };
          setTimeout(() => broadcastRef.current?.(tiedGame), 0);
          return tiedGame;
        }
      }

      setTimeout(() => broadcastRef.current?.(updated), 0);
      return updated;
    });
  }, [playoffStyle]);

  const handlePlayoffComplete = useCallback((winners = [], scores = {}) => {
    setGame(prev => {
      if (!prev) return prev;
      const nextLegsWonMap = { ...(prev.legsWonMap || legsWonMap) };
      winners.forEach(i => {
        const wName = prev.players[i]?.name;
        if (wName) nextLegsWonMap[wName] = (nextLegsWonMap[wName] || 0) + 1;
      });
      setLegsWonMap(nextLegsWonMap);

      const updatedPlayers = prev.players.map(p => ({
        ...p,
        legsWon: nextLegsWonMap[p.name] || 0,
      }));

      const marksMap = {};
      const dartsMap = {};
      const perfectsMap = {};
      updatedPlayers.forEach(p => {
        marksMap[p.name] = getPlayerMarks(p);
        dartsMap[p.name] = p.darts ?? 0;
        perfectsMap[p.name] = p.perfectCount ?? 0;
      });
      recordGame(updatedPlayers, winners, prev.round, marksMap, dartsMap, prev.gameId);

      const fStats = { rounds: prev.round, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
      setFinalWinners(winners);
      setFinalStats(fStats);
      setPlayoffScores(scores);
      setView('winner');

      const updated = {
        ...prev,
        players: updatedPlayers,
        view: 'winner',
        finalWinners: winners,
        finalStats: fStats,
        legsWonMap: nextLegsWonMap,
        playoffScores: scores,
      };
      setTimeout(() => broadcastRef.current?.(updated), 0);
      return updated;
    });
  }, [legsWonMap]);

  const handlePlayoffTie = useCallback((tiedPlayers) => {
    setGame(prev => {
      if (!prev) return prev;
      const activeStyle = prev.playoffStyle || playoffStyle;
      const nextNum = activeStyle === 'bulls' ? 'Bull' : choosePlayoffNumber();
      const nextRound = (prev.playoffRound || 1) + 1;
      setPlayoffPlayers(tiedPlayers);
      setPlayoffScores({});
      setPlayoffSubmitted({});
      setPlayoffNumber(nextNum);
      setPlayoffRound(nextRound);
      setView('playoff');

      const updated = {
        ...prev,
        view: 'playoff',
        playoffStyle: activeStyle,
        playoffNumber: nextNum,
        playoffPlayers: tiedPlayers,
        playoffScores: {},
        playoffSubmitted: {},
        playoffRound: nextRound,
      };
      setTimeout(() => broadcastRef.current?.(updated), 0);
      return updated;
    });
  }, [playoffStyle]);

  // --- Restart ---
  function handleRestart() {
    setGame(null);
    setFinalWinners([]);
    setFinalStats(null);
    setPlayoffScores({});
    setPlayoffNumber(null);
    setPlayoffStyle(null);
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
        loggedInUser={loggedInUser}
        onLogout={() => {
          logout();
          setLoggedInUser(null);
          setMyPlayerName(null);
        }}
        onDeleteAccount={() => {
          deleteAccount();
          setLoggedInUser(null);
          setMyPlayerName(null);
        }}
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
    const rounds = finalStats?.rounds ?? game.round;
    return (
      <div className="screen">
        <div className="winner-screen">
          <div className="trophy">🏆</div>
          <h1>{winnerNames.join(' & ')} wins!</h1>
          <p>
            {isPlayoff
              ? ((game?.playoffStyle === 'bulls' || playoffStyle === 'bulls')
                  ? `Bullseye tie-breaker winner with ${playoffScores[finalWinners[0]] ?? 0} bull${playoffScores[finalWinners[0]] !== 1 ? 's' : ''}!`
                  : `Playoff winner with ${playoffScores[finalWinners[0]] ?? 0} hit${playoffScores[finalWinners[0]] !== 1 ? 's' : ''}!`)
              : 'Closed on the Bullseye!'}
          </p>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Final Player Results</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {game.players.map((p, idx) => {
              const pMarks = finalStats?.marksMap?.[p.name] ?? getPlayerMarks(p);
              const pPerfects = finalStats?.perfectsMap?.[p.name] ?? p.perfectCount ?? 0;
              const pLegs = p.legsWon ?? finalStats?.legsWonMap?.[p.name] ?? legsWonMap[p.name] ?? 0;
              const pRounds = p.finished ? (p.finishedRound ?? rounds) : rounds;
              const pMpr = pRounds > 0 ? (pMarks / pRounds).toFixed(2) : '—';
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
            <p className="section-title" style={{ marginBottom: '0.5rem' }}>
              {(game?.playoffStyle === 'bulls' || playoffStyle === 'bulls') ? 'Bullseye Tie-Breaker Scores' : 'Playoff Scores'}
            </p>
            {Object.entries(playoffScores)
              .sort((a, b) => b[1] - a[1])
              .map(([pi, sc]) => (
                <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{game.players[pi]?.name}</span>
                  <strong style={{ color: 'var(--accent)' }}>
                    {sc} {(game?.playoffStyle === 'bulls' || playoffStyle === 'bulls') ? 'bull' : 'mark'}{sc !== 1 ? 's' : ''}
                  </strong>
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
            handleRoomStart(playerNames, true, game.tieBreaker);
          }}>
            🎯 Next Game / Rematch
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
        playoffStyle={playoffStyle}
        playoffNumber={playoffNumber}
        playoffScores={playoffScores}
        playoffSubmitted={playoffSubmitted}
        playoffRound={playoffRound}
        myPlayerName={myPlayerName}
        onChoosePlayoffStyle={handleChoosePlayoffStyle}
        onPlayoffSubmit={handlePlayoffSubmit}
        onPlayoffComplete={handlePlayoffComplete}
        onPlayoffTie={handlePlayoffTie}
      />
    );
  }

  const splashOverlay = splashRound !== null && (
    <div className="new-round-splash-overlay">
      <div className="new-round-splash-content">
        <h1 className="new-round-splash-title">NEW ROUND</h1>
        <div className="new-round-splash-number">{splashRound}</div>
      </div>
    </div>
  );

  if (view === 'scoreboard') {
    return (
      <>
        {splashOverlay}
        <Scoreboard game={game} roomCode={roomCode} onClose={() => setView('scoring')} />
      </>
    );
  }

  // scoring view — select active player based on myPlayerName or currentPlayerIndex
  const matchedIdx = myPlayerName
    ? game.players.findIndex(p => p.name?.trim().toLowerCase() === myPlayerName.trim().toLowerCase())
    : -1;
  const activeIdx = matchedIdx >= 0 ? matchedIdx : (game.currentPlayerIndex ?? 0);
  const activePlayer = game.players[activeIdx] || game.players[0];

  return (
    <>
      {splashOverlay}
      <ScoringScreen
        key={`scoring-${activeIdx}-${game.round}`}
        game={game}
        player={activePlayer}
        playerIndex={activeIdx}
        myPlayerName={myPlayerName}
        roomCode={roomCode}
        onTurnComplete={handleTurnComplete}
        onShowScoreboard={() => setView('scoreboard')}
        onSync={forceSync}
        onQuit={handleRestart}
      />
    </>
  );
}
