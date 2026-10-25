import { useEffect, useState } from 'react';

// Progress lives in localStorage, which can be unavailable (private mode, blocked storage),
// so every access is guarded and the app still works without it.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore: progress just won't persist.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
