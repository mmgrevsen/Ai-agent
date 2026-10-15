/** Haptic feedback through the Vibration API (Android WebView/Chrome). iOS WebViews ignore it gracefully. */
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success'): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const map = { light: 10, medium: 25, heavy: 50, success: [20, 40, 30] } as const;
  try {
    navigator.vibrate(map[pattern] as number | number[]);
  } catch {
    /* unsupported */
  }
}
