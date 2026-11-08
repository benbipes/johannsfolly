import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';

import DartIntro from './components/DartIntro.jsx';
import CodeScreen from './components/CodeScreen.jsx';
import NameScreen from './components/NameScreen.jsx';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import ScoringScreen from './components/ScoringScreen.jsx';
import PlayoffScreen from './components/PlayoffScreen.jsx';
import LeaderboardView from './components/Leaderboard.jsx';

import { createGame, mergeGameState, getPlayerMarks, resultRecordId, voidedRecordIds } from './gameLogic.js';
import { useGameSync } from './useGameSync.js';
import { getSavedName, forgetName, refreshLoggedUserPresence } from './auth.js';
import { isUnlocked } from './groupCode.js';
import { loadActiveSession, saveActiveSession, shouldShowIntro, markIntroSeen } from './session.js';
import { viewAfterSync } from './views.js';
import { recordGame, voidRecord, clearCacheKeepHistory } from './leaderboard.js';
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
  const [showIntro, setShowIntro] = useState(shouldShowIntro);
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [loggedInUser, setLoggedInUser] = useState(() => getSavedName());
  const [restored] = useState(loadActiveSession);
  const [roomCode, setRoomCode] = useState(restored.roomCode);
  const [myPlayerName, setMyPlayerName] = useState(restored.playerName || loggedInUser);
  const [view, setView] = useState(restored.view);
  const [game, setGame] = useState(restored.game);

  const [isHost, setIsHost] = useState(restored.isHost);
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

  const [backoutToast, setBackoutToast] = useState(null);
  const backoutToastTimerRef = useRef(null);
  const lastBackoutRef = useRef(0);

  const triggerBackoutToast = useCallback((msg) => {
    setBackoutToast(msg);
    if (backoutToastTimerRef.current) clearTimeout(backoutToastTimerRef.current);
    backoutToastTimerRef.current = setTimeout(() => {
      setBackoutToast(null);
    }, 3500);
  }, []);

  const triggerRoundSplash = useCallback((roundNum, durationMs = 2000) => {
    setSplashRound(roundNum);
    if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    splashTimerRef.current = setTimeout(() => {
      setSplashRound(null);
    }, durationMs);
  }, []);

  // Check URL query params for manual cache reset (?reset=1 or ?clear=1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('reset') || params.has('clear')) {
          clearCacheKeepHistory();
          window.location.href = window.location.origin + window.location.pathname;
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Session persistence for page refresh recovery
  useEffect(() => {
    saveActiveSession({ roomCode, playerName: myPlayerName, view, isHost });
  }, [roomCode, myPlayerName, view, isHost]);

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

  const broadcastRef = useRef(null);

  // Sync game state across tabs/devices in the same room
  const { broadcast, forceSync } = useGameSync(roomCode, useCallback((remoteGame) => {
    if (!remoteGame) return;

    setGame(prevGame => {
      let mergedGame = mergeGameState(prevGame, remoteGame);
      let needsBroadcast = false;

      if (mergedGame?.backout && mergedGame.backout.timestamp > (lastBackoutRef.current || 0)) {
        lastBackoutRef.current = mergedGame.backout.timestamp;
        triggerBackoutToast(`↩ ${mergedGame.backout.playerName}'s score was backed out for rescoring.`);
      }

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

      // A result that was backed out on another phone is voided here too.
      if ((mergedGame?.resultSeq ?? 0) > 0) voidedRecordIds(mergedGame).forEach(voidRecord);

      const isNewGame = prevGame && mergedGame.gameId !== prevGame.gameId;
      if (isNewGame) {
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
        setView(current => viewAfterSync(current, prevGame?.view, mergedGame.view));
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
            resultRecordId(mergedGame)
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


      // Capture player snapshot before this turn so score can be backed out if needed
      const roundSnapshot = {
        round: prev.round,
        targetIndex: targetPlayer.targetIndex,
        finished: targetPlayer.finished,
        finishedRound: targetPlayer.finishedRound,
        roundCompleted: targetPlayer.roundCompleted,
        lastIsPerfect: targetPlayer.lastIsPerfect,
        perfectInRound: targetPlayer.perfectInRound,
        perfectCount: targetPlayer.perfectCount,
        marks: targetPlayer.marks,
        darts: targetPlayer.darts,
        bullsHit: targetPlayer.bullsHit,
        legsWon: targetPlayer.legsWon,
      };

      const isFinished = hitBull || Boolean(targetPlayer.finished);
      const dartsThisTurn = allDarts ? allDarts.length : 0;

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
          roundSnapshot,
        };
      });

      // Advance currentPlayerIndex to next player on roster
      const nextPlayerIdx = (scoringPlayerIdx + 1) % players.length;

      // Check if ALL active players have completed the current round
      const roundJustEnded = players.every(p => p.finished || (p.roundCompleted ?? 0) >= prev.round);
      const newRound = roundJustEnded ? prev.round + 1 : prev.round;
      let advanced = {
        ...prev,
        players,
        currentPlayerIndex: nextPlayerIdx,
        round: newRound,
      };

      let nextView = 'scoring';

      if (roundJustEnded) {
        const bullPlayers = players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.finished)
          .map(({ i }) => i);

        if (bullPlayers.length === 0) {
          // The round has already moved on, so cover the screen now. Only the sound waits,
          // to let a special sound finish first.
          triggerRoundSplash(newRound, 2000 + soundDelayMs);
          if (soundDelayMs > 0) {
            setTimeout(playNewRoundSound, soundDelayMs);
          } else {
            playNewRoundSound();
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
          recordGame(updatedPlayers, [winnerIdx], prev.round, marksMap, dartsMap, resultRecordId(prev));
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
            round: prev.round,
            players: updatedPlayers,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            legsWonMap: nextLegsWonMap,
            legsBeforeResult: prev.legsWonMap ?? {},
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
            round: prev.round,
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

  // --- Back out a player's score to allow rescoring ---
  const handleBackOutScore = useCallback((playerIdx) => {
    setGame(prev => {
      if (!prev || !prev.players || !prev.players[playerIdx]) return prev;
      const targetPlayer = prev.players[playerIdx];
      const snapshot = targetPlayer.roundSnapshot;
      const backoutTimestamp = Date.now();

      const restoredPlayer = snapshot
        ? {
            ...targetPlayer,
            targetIndex: snapshot.targetIndex,
            finished: snapshot.finished,
            finishedRound: snapshot.finishedRound,
            roundCompleted: snapshot.roundCompleted,
            lastIsPerfect: snapshot.lastIsPerfect,
            perfectInRound: snapshot.perfectInRound,
            perfectCount: snapshot.perfectCount,
            marks: snapshot.marks,
            darts: snapshot.darts,
            bullsHit: snapshot.bullsHit,
            legsWon: snapshot.legsWon,
            roundSnapshot: null,
            backoutAt: backoutTimestamp,
          }
        : {
            ...targetPlayer,
            roundCompleted: Math.max(0, (targetPlayer.roundCompleted || prev.round) - 1),
            finished: false,
            finishedRound: null,
            roundSnapshot: null,
            backoutAt: backoutTimestamp,
          };

      // Backing out a finished game voids its recorded result and gives back the leg it awarded.
      const hadResult = prev.finalWinners?.length > 0;
      if (hadResult) voidRecord(resultRecordId(prev));
      const restoredLegs = hadResult ? { ...(prev.legsBeforeResult ?? prev.legsWonMap) } : (prev.legsWonMap ?? {});
      if (hadResult) setLegsWonMap(restoredLegs);

      const updatedPlayers = prev.players.map((p, idx) => {
        const player = idx === playerIdx ? restoredPlayer : p;
        return hadResult ? { ...player, legsWon: restoredLegs[player.name] || 0 } : player;
      });
      const targetRound = snapshot ? snapshot.round : Math.max(1, restoredPlayer.roundCompleted + 1);

      lastBackoutRef.current = backoutTimestamp;
      const backoutInfo = {
        playerIndex: playerIdx,
        playerName: targetPlayer.name,
        timestamp: backoutTimestamp,
      };

      const revertedGame = {
        ...prev,
        players: updatedPlayers,
        round: targetRound,
        currentPlayerIndex: playerIdx,
        view: 'scoring',
        finalWinners: [],
        finalStats: null,
        playoffScores: {},
        playoffSubmitted: {},
        playoffNumber: null,
        playoffRound: 1,
        legsWonMap: restoredLegs,
        legsBeforeResult: null,
        resultSeq: (prev.resultSeq ?? 0) + (hadResult ? 1 : 0),
        backout: backoutInfo,
        updatedAt: backoutTimestamp,
      };

      setView('scoring');
      setFinalWinners([]);
      setFinalStats(null);
      setPlayoffScores({});
      setPlayoffSubmitted({});
      setPlayoffNumber(null);
      setPlayoffRound(1);
      triggerBackoutToast(`↩ ${targetPlayer.name}'s score was backed out for rescoring.`);

      setTimeout(() => broadcastRef.current?.(revertedGame), 0);
      return revertedGame;
    });
  }, [triggerBackoutToast]);

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
          const regulationRounds = updated.players[winnerIdx]?.finishedRound ?? updated.round ?? 1;
          recordGame(updatedPlayers, [winnerIdx], regulationRounds, marksMap, dartsMap, resultRecordId(updated));

          const fStats = { rounds: regulationRounds, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
          setFinalWinners([winnerIdx]);
          setFinalStats(fStats);
          setView('winner');

          const winnerGame = {
            ...updated,
            round: regulationRounds,
            players: updatedPlayers,
            view: 'winner',
            finalWinners: [winnerIdx],
            finalStats: fStats,
            legsWonMap: nextLegsWonMap,
            legsBeforeResult: prev.legsWonMap ?? {},
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
      const winnerIdx = winners[0];
      const regulationRounds = (winnerIdx !== undefined ? prev.players[winnerIdx]?.finishedRound : null) ?? prev.round ?? 1;
      recordGame(updatedPlayers, winners, regulationRounds, marksMap, dartsMap, resultRecordId(prev));

      const fStats = { rounds: regulationRounds, marksMap, dartsMap, perfectsMap, legsWonMap: nextLegsWonMap };
      setFinalWinners(winners);
      setFinalStats(fStats);
      setPlayoffScores(scores);
      setView('winner');

      const updated = {
        ...prev,
        round: regulationRounds,
        players: updatedPlayers,
        view: 'winner',
        finalWinners: winners,
        finalStats: fStats,
        legsWonMap: nextLegsWonMap,
        legsBeforeResult: prev.legsWonMap ?? {},
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

  const finishIntro = useCallback(() => {
    markIntroSeen();
    setShowIntro(false);
  }, []);

  // ---- Render ----

  if (showIntro) {
    return <DartIntro onDone={finishIntro} />;
  }

  if (!unlocked) {
    return <CodeScreen onUnlock={() => setUnlocked(true)} />;
  }

  if (!loggedInUser) {
    return <NameScreen onDone={(name) => setLoggedInUser(name)} />;
  }

  if (view === 'lobby') {
    return (
      <Lobby
        loggedInUser={loggedInUser}
        onChangeName={() => {
          forgetName();
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

  const splashOverlay = splashRound !== null && (
    <div className="new-round-splash-overlay">
      <div className="new-round-splash-content">
        {splashRound > 1 && (
          <div className="new-round-splash-prev-badge">
            <span>🎯</span>
            <span>Round {splashRound - 1} Completed</span>
          </div>
        )}
        <h1 className="new-round-splash-title">NEW ROUND</h1>
        <div className="new-round-splash-number">{splashRound}</div>
      </div>
    </div>
  );

  const backoutToastOverlay = backoutToast && (
    <div className="backout-toast-overlay">
      <div className="backout-toast-card">
        <span className="backout-toast-icon">↩</span>
        <span className="backout-toast-msg">{backoutToast}</span>
      </div>
    </div>
  );

  if (view === 'winner') {
    const winnerNames = finalWinners.map(i => game.players[i]?.name).filter(Boolean);
    const isPlayoff = Object.keys(playoffScores).length > 0;
    const winnerPlayer = finalWinners.length > 0 ? game.players[finalWinners[0]] : null;
    const rounds = winnerPlayer?.finishedRound ?? finalStats?.rounds ?? game.round ?? 1;
    return (
      <>
        {backoutToastOverlay}
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

          <div className="winner-rounds-badge">
            <span className="winner-rounds-icon">🎯</span>
            <span>
              Game completed in <strong>{rounds} {rounds === 1 ? 'round' : 'rounds'}</strong>{isPlayoff ? ' (+ tie-breaker)' : ''}
            </span>
          </div>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>Final Player Results</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {game.players.map((p, idx) => {
              const pMarks = p.finished ? 21 : (finalStats?.marksMap?.[p.name] ?? getPlayerMarks(p));
              const pPerfects = finalStats?.perfectsMap?.[p.name] ?? p.perfectCount ?? 0;
              const pLegs = p.legsWon ?? finalStats?.legsWonMap?.[p.name] ?? legsWonMap[p.name] ?? 0;
              const pRounds = p.finished ? (p.finishedRound ?? rounds) : (p.roundCompleted || rounds);
              const pMpr = pRounds > 0 ? (pMarks / pRounds).toFixed(2) : '—';
              const isWinner = finalWinners.includes(idx);
              return (
                <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'var(--surface2)', borderRadius: '10px', border: isWinner ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: isWinner ? 'var(--accent)' : 'var(--text)' }}>
                      {isWinner ? '🏆 ' : ''}{p.name}
                    </div>
                    <div className="final-player-stats-row">
                      <span className="final-stat-mpr">{pMpr} MPR</span>
                      <span className="final-stat-dot">•</span>
                      <span>{pRounds} {pRounds === 1 ? 'round' : 'rounds'}</span>
                      <span className="final-stat-dot">•</span>
                      <span>{pMarks}/21 numbers</span>
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
          {finalWinners.length > 0 && (
            <button
              className="btn-secondary btn-backout-large"
              onClick={() => {
                const winnerPlayer = game.players[finalWinners[0]];
                if (window.confirm(`Back out ${winnerPlayer?.name || 'winner'}'s score and resume the game?`)) {
                  handleBackOutScore(finalWinners[0]);
                }
              }}
            >
              ↩ Back Out Winning Score & Resume Game
            </button>
          )}
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
      </>
    );
  }

  if (view === 'leaderboard') {
    return <LeaderboardView onClose={() => setView(game?.players ? 'winner' : 'lobby')} />;
  }

  if (view === 'playoff') {
    return (
      <>
        {backoutToastOverlay}
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
      </>
    );
  }

  if (view === 'scoreboard') {
    return (
      <>
        {splashOverlay}
        {backoutToastOverlay}
        <Scoreboard
          game={game}
          roomCode={roomCode}
          onClose={() => setView('scoring')}
          onBackOutScore={handleBackOutScore}
        />
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
      {backoutToastOverlay}
      <ScoringScreen
        key={`scoring-${activeIdx}-${game.round}`}
        game={game}
        player={activePlayer}
        playerIndex={activeIdx}
        myPlayerName={myPlayerName}
        roomCode={roomCode}
        onTurnComplete={handleTurnComplete}
        onBackOutScore={handleBackOutScore}
        onShowScoreboard={() => setView('scoreboard')}
        onSync={forceSync}
        onQuit={handleRestart}
      />
    </>
  );
}
