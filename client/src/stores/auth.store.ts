import { create } from 'zustand';
import type { AuthUser } from '@/types/api';

const STORAGE_KEY = 'superlink-hrms.auth';

interface PersistedAuth {
  user: AuthUser;
  accessToken: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setSession: (session: PersistedAuth) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
  hydrate: () => void;
}

function readStorage(): PersistedAuth | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedAuth) : null;
  } catch {
    return null;
  }
}

function writeStorage(session: PersistedAuth | null): void {
  if (typeof window === 'undefined') return;
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

const initial = readStorage();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial?.user ?? null,
  accessToken: initial?.accessToken ?? null,
  isAuthenticated: Boolean(initial?.accessToken),

  setSession: (session) => {
    writeStorage(session);
    set({ user: session.user, accessToken: session.accessToken, isAuthenticated: true });
  },

  setAccessToken: (accessToken) => {
    const current = readStorage();
    writeStorage(current ? { ...current, accessToken } : null);
    set({ accessToken });
  },

  setUser: (user) => {
    const current = readStorage();
    writeStorage(current ? { ...current, user } : null);
    set({ user });
  },

  clear: () => {
    writeStorage(null);
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  hydrate: () => {
    const session = readStorage();
    set({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      isAuthenticated: Boolean(session?.accessToken),
    });
  },
}));

export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
export const authStorageKey = STORAGE_KEY;
