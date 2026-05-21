"use client";

const STORAGE_KEY = "phoenix-vault.groq-key";

export function getGroqKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setGroqKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // ignore quota errors
  }
}

export function clearGroqKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isLikelyGroqKey(value: string): boolean {
  const trimmed = value.trim();
  return /^gsk_[A-Za-z0-9]{20,}$/.test(trimmed);
}
