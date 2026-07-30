"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS, COLORS_COLORBLIND_SAFE } from "@/lib/game/constants";

// [MANIFEST 16: Colorblind Safe Palette] Purely a client side rendering
// choice, the same reasoning the tutorial seen flag in GameRoom.tsx already
// follows: read once on mount, write on toggle, no server round trip and no
// new trust boundary, since this never changes what any other captain sees.
const COLORBLIND_SAFE_KEY = "portmasters_colorblind_safe";

export function useColorPreference() {
  const [colorblindSafe, setColorblindSafeState] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(COLORBLIND_SAFE_KEY) === "1";
    } catch {
      // Private browsing or a disabled storage API: default stays off.
    }
    // Deferred so this isn't a synchronous setState call inside the effect
    // body (react-hooks/set-state-in-effect); the identical pattern is in
    // src/lib/use-realtime.ts.
    if (stored) Promise.resolve().then(() => setColorblindSafeState(true));
  }, []);

  const setColorblindSafe = useCallback((value: boolean) => {
    setColorblindSafeState(value);
    try {
      localStorage.setItem(COLORBLIND_SAFE_KEY, value ? "1" : "0");
    } catch {
      // Best effort only; the in memory state above still applies for the
      // rest of this session even if persisting it fails.
    }
  }, []);

  const colorFor = useCallback(
    (item: string): string | undefined =>
      (colorblindSafe ? COLORS_COLORBLIND_SAFE : COLORS)[item],
    [colorblindSafe],
  );

  return { colorblindSafe, setColorblindSafe, colorFor };
}
