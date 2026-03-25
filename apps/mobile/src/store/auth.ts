import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, userId: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  isAuthenticated: false,

  setAuth: (token, userId) =>
    set({ token, userId, isAuthenticated: true }),

  clearAuth: () =>
    set({ token: null, userId: null, isAuthenticated: false }),
}));
