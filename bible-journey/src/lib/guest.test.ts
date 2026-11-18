import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isGuest, setGuest } from './guest';

/** The same in-memory stand-in `theme.test.ts` uses, since there is no DOM here. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', new EventTarget());
});

afterEach(() => {
  setGuest(false);
  vi.unstubAllGlobals();
});

describe('reading without an account', () => {
  it('is off until somebody chooses it, and remembered once they do', () => {
    expect(isGuest()).toBe(false);
    setGuest(true);
    expect(isGuest()).toBe(true);
    setGuest(false);
    expect(isGuest()).toBe(false);
  });

  it('lives under the prefix that closing an account clears', () => {
    // deleteAccount in cloud.tsx removes every key by this prefix, so a choice
    // stored anywhere else would outlive the account it was made beside.
    setGuest(true);
    expect([...storage.data.keys()]).toEqual(['bible-journey/guest']);
  });

  it('still holds for the session when storage refuses it', () => {
    // Private browsing. Without the fallback the gate would bounce straight
    // back to the sign-in screen on the very next render.
    const refuse = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
    expect(isGuest()).toBe(false);
    setGuest(true);
    expect(isGuest()).toBe(true);
  });

  it('tells whatever is watching that it changed', () => {
    const heard = vi.fn();
    window.addEventListener('bibley:guest', heard);
    setGuest(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
