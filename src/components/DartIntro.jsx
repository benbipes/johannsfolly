import { useEffect, useState } from 'react';
import { playBoing, unlockAudio } from '../audio.js';

const FLIGHT_MS = 420;
const STUCK_MS = 1500;
const FADE_MS = 400;

/**
 * Opening screen: the player taps, the yellow dart flies into the board and it goes "boing".
 * It waits for a tap because phones only play sound after one.
 */
export default function DartIntro({ onDone }) {
  const [phase, setPhase] = useState('ready'); // ready → flying → stuck → leaving

  useEffect(() => {
    const next = { flying: ['stuck', FLIGHT_MS], stuck: ['leaving', STUCK_MS], leaving: ['done', FADE_MS] }[phase];
    if (!next) return undefined;
    const [nextPhase, delay] = next;
    const timer = setTimeout(() => {
      if (nextPhase === 'stuck') playBoing();
      if (nextPhase === 'done') onDone();
      else setPhase(nextPhase);
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, onDone]);

  function throwDart() {
    if (phase !== 'ready') return;
    unlockAudio();
    setPhase('flying');
  }

  return (
    <div
      className={`dart-intro dart-intro-${phase}`}
      role="button"
      tabIndex={0}
      aria-label="Tap to throw the dart"
      onClick={throwDart}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') throwDart(); }}
    >
      <svg className="dart-intro-art" viewBox="0 0 360 200" aria-hidden="true">
        <g className="dart-intro-board">
          <ellipse cx="300" cy="100" rx="46" ry="94" fill="var(--accent)" />
          <ellipse cx="290" cy="100" rx="40" ry="84" fill="var(--bg)" />
          <ellipse cx="286" cy="100" rx="10" ry="24" fill="var(--accent)" />
        </g>
        <g transform="translate(280 100)">
          <g className="dart-intro-dart" fill="var(--accent)">
            <path d="M0 0 L-16 -3 L-16 3 Z" />
            <rect x="-64" y="-5.5" width="50" height="11" rx="5.5" />
            <rect x="-122" y="-2.5" width="60" height="5" />
            <path d="M-112 -2 L-136 -26 L-162 -28 L-146 -2 Z" />
            <path d="M-112 2 L-136 26 L-162 28 L-146 2 Z" />
          </g>
        </g>
        <text className="dart-intro-boing" x="215" y="36" textAnchor="middle">BOING!</text>
      </svg>
      <h1 className="dart-intro-title">
        <span>Johann&rsquo;s</span> <span className="dart-intro-title-folly">Folly</span>
      </h1>
      <p className="dart-intro-prompt">Tap to throw</p>
    </div>
  );
}
