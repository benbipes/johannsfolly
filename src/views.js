// Screens one player opens for themselves. Syncing with the other phones must not close them.
const PERSONAL_VIEWS = ['scoreboard', 'leaderboard'];

/**
 * Returns the screen to show after syncing. The game's screen replaces a personal screen
 * only when the game moves to a different screen, such as the winner screen.
 */
export function viewAfterSync(currentView, previousGameView, gameView) {
  if (!gameView) return currentView;
  if (PERSONAL_VIEWS.includes(currentView) && gameView === previousGameView) return currentView;
  return gameView;
}
