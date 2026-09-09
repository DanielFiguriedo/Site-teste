import { useCallback, useEffect, useState } from "react";
import type { Platform } from "@shared/types";

const STORAGE_KEY = "store:player";

export interface Player {
  nick: string;
  platform: Platform;
}

/** Java nicknames: 3 to 16 characters, letters, digits and underscore only. */
export const JAVA_NICK_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
/** Bedrock allows spaces and is more permissive. */
export const BEDROCK_NICK_PATTERN = /^[A-Za-z0-9_ .]{3,20}$/;

export function isValidNick(nick: string, platform: Platform): boolean {
  const pattern = platform === "bedrock" ? BEDROCK_NICK_PATTERN : JAVA_NICK_PATTERN;
  return pattern.test(nick.trim());
}

/** 3D render of the player head. Public service, no API key required. */
export function avatarUrl(nick: string, size = 64): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/${size}`;
}

function read(): Player | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Player;
    return data?.nick ? data : null;
  } catch {
    // Private window or blocked storage: carry on without a saved nick.
    return null;
  }
}

/**
 * The nick is both the identity and the delivery address of an order. Keeping
 * it between visits saves the player from retyping (and mistyping) it on every
 * purchase.
 */
export function usePlayer() {
  const [player, setPlayer] = useState<Player | null>(() => read());

  useEffect(() => {
    const onChange = () => setPlayer(read());
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const save = useCallback((next: Player | null) => {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // No persistence available: in-memory state still works this session.
    }
    setPlayer(next);
  }, []);

  return { player, save };
}
