import { useState, useEffect } from "react";

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

const listeners = new Set<() => void>();

export function useUserName(): string {
  const [name, setName] = useState(getUserName() || "User");

  useEffect(() => {
    const handler = () => {
      setName(getUserName() || "User");
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return name;
}

export function setUserName(name: string): void {
  save({ displayName: name });
  listeners.forEach((l) => l());
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((l) => l());
}

