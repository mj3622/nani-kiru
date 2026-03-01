const STORAGE_KEY = "nani-kiru:done-problems";

export function loadProgress(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed as string[]);
  } catch {
    return new Set();
  }
}

export function markDone(problemId: string): void {
  try {
    const current = loadProgress();
    if (current.has(problemId)) return;
    current.add(problemId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
