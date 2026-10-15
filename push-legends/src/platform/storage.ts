import { MemoryStorage, type StorageAdapter } from '../core/state/save';

/**
 * localStorage adapter (works in browsers and inside the Capacitor WebView). Falls back to memory
 * if storage is unavailable (private mode, blocked site data) so the game still runs.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private fallback = new MemoryStorage();
  private available: boolean;

  constructor() {
    this.available = (() => {
      try {
        const k = '__pl_probe__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    })();
  }

  get persistent(): boolean {
    return this.available;
  }

  getItem(key: string): string | null {
    if (!this.available) return this.fallback.getItem(key);
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.fallback.getItem(key);
    }
  }

  setItem(key: string, value: string): void {
    if (!this.available) return this.fallback.setItem(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      this.fallback.setItem(key, value);
    }
  }

  removeItem(key: string): void {
    if (!this.available) return this.fallback.removeItem(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      this.fallback.removeItem(key);
    }
  }
}
