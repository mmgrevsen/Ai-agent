import type { RepRejection } from '../core/exercise/repCounter';

/**
 * Spoken rep count and short coaching cues (Web Speech API, on-device voices), so the player can
 * train without looking at the phone. Silently does nothing where speech is unavailable.
 */
const CUES: Partial<Record<RepRejection, string>> = {
  too_shallow: 'Lower',
  too_fast: 'Slower',
  body_line: 'Straight body',
  knees_bent: 'Straighten your legs',
  tracking: 'Check the camera',
  not_horizontal: 'Get in position',
};

export function voiceCoach(): { count: (n: number) => void; cue: (r: RepRejection) => void; stop: () => void } {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let lastCue = 0;
  const say = (text: string, interrupt: boolean) => {
    if (!synth) return;
    try {
      if (interrupt) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.15;
      u.volume = 1;
      synth.speak(u);
    } catch {
      /* speech unavailable */
    }
  };
  return {
    count: (n) => say(String(n), true),
    cue: (r) => {
      const text = CUES[r];
      const now = Date.now();
      // At most one coaching cue every 4 seconds so it never nags
      if (!text || now - lastCue < 4000) return;
      lastCue = now;
      say(text, false);
    },
    stop: () => {
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
