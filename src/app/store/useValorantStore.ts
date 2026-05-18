"use client";

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface SavedRiotAccount {
  puuid: string;
  game_name: string;
  shard: string;
  auth_token: string;
  entitlement_token: string;
  last_updated: number;
  login_type: "riot_client" | "credentials";
}

interface ValorantStoreState {
  savedAccounts: SavedRiotAccount[];
  activePuuid: string;
  activeAccountName: string | null;
  loading: boolean;
  
  loadAccounts: () => Promise<void>;
  setActiveAccount: (puuid: string) => Promise<void>;
  deleteAccount: (puuid: string) => Promise<void>;
  addClientAccount: () => Promise<void>;
  logoutClientKeepSession: () => Promise<void>;
}

export const useValorantStore = create<ValorantStoreState>((set, get) => ({
  savedAccounts: [],
  activePuuid: "running_client",
  activeAccountName: null,
  loading: false,

  loadAccounts: async () => {
    set({ loading: true });
    try {
      const savedAccounts = await invoke<SavedRiotAccount[]>("get_valorant_accounts");
      const activePuuid = await invoke<string>("get_active_valorant_account");
      
      // Tự động xác định tên tài khoản đang hiển thị ở header
      let activeAccountName = null;
      if (activePuuid === "running_client") {
        try {
          const creds = await invoke<any>("get_riot_credentials");
          if (creds && creds.game_name) {
            activeAccountName = creds.game_name;
          }
        } catch {}
      } else {
        const found = savedAccounts.find(a => a.puuid === activePuuid);
        if (found) {
          activeAccountName = found.game_name;
        }
      }

      set({ savedAccounts, activePuuid, activeAccountName });
    } catch (err) {
      console.error("Lỗi khi đồng bộ Zustand store:", err);
    } finally {
      set({ loading: false });
    }
  },

  setActiveAccount: async (puuid) => {
    await invoke("set_active_valorant_account", { puuid });
    set({ activePuuid: puuid });
    await get().loadAccounts();
  },

  deleteAccount: async (puuid) => {
    await invoke("delete_valorant_account", { puuid });
    await get().loadAccounts();
  },

  addClientAccount: async () => {
    await invoke<SavedRiotAccount>("add_valorant_account_client");
    await get().loadAccounts();
  },

  logoutClientKeepSession: async () => {
    await invoke("logout_riot_client_keep_session");
    await get().loadAccounts();
  }
}));
