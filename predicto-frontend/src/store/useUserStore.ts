/**
 * useUserStore.ts
 * Persistent user preferences stored in localStorage.
 * Currently stores the display name set during onboarding.
 */

const STORAGE_KEY = "predicto_user";

interface UserData {
  displayName: string;
}

function load(): UserData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserData;
    return parsed.displayName ? parsed : null;
  } catch {
    return null;
  }
}

function save(data: UserData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getUserName(): string | null {
  return load()?.displayName ?? null;
}

export function setUserName(name: string): void {
  save({ displayName: name });
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}
