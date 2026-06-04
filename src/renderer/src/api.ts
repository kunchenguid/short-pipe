import type { AppEvent } from "@shared/events";
import { useEffect } from "react";

export const sp = window.shortpipe;

/** Subscribe to the one-way main->renderer event channel for the component's lifetime. */
export function useAppEvents(listener: (event: AppEvent) => void): void {
  useEffect(() => {
    const off = sp.events.on(listener);
    return off;
  }, [listener]);
}

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "--:--";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
