import { useEffect, useRef, useState } from "react";
import { sp } from "../api";
import { Icon } from "./Icon";

// Short Pipe is delivered through the Homebrew cask in kunchenguid/homebrew-tap
// (see .github/workflows/release-please.yml), so this is the upgrade command we
// hand users: `brew update` refreshes the tap, then `brew upgrade --cask
// short-pipe` installs the new build. Exported so the test pins the exact string.
export const UPGRADE_COMMAND = "brew update && brew upgrade --cask short-pipe";
const UPDATE_STATUS_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

type UpdateStatus = Awaited<ReturnType<typeof sp.app.getUpdateStatus>>;

// Sits in the topbar next to Sign out. The main process runs the actual release
// check; this reads the cached status on mount and, when a newer version exists,
// shows a small popover with the copy-paste upgrade command and a link to the
// release notes. Renders nothing (and never surfaces an error) when there is no
// update.
export function UpdateIndicator() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      try {
        const next = await sp.app.getUpdateStatus();
        if (!cancelled && next) setStatus(next);
      } catch {
        // Best-effort: a failed check should never disrupt the shell.
      }
    }

    void refreshStatus();
    const refreshTimer = setInterval(() => void refreshStatus(), UPDATE_STATUS_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, []);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!status?.updateAvailable) return null;

  async function copyCommand() {
    try {
      await navigator.clipboard?.writeText(UPGRADE_COMMAND);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the command stays visible to copy by hand.
    }
  }

  return (
    <div className="update-indicator" ref={rootRef}>
      <button
        type="button"
        className="btn small ghost update-trigger"
        aria-label={`Update available: v${status.latestVersion}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="arrowUpCircle" />
        Update
      </button>
      {open && (
        <div className="update-card" role="dialog" aria-label="Update available">
          <div className="update-card-head">Update available</div>
          <p className="update-card-desc">
            You{"’"}re on v{status.currentVersion}. v{status.latestVersion} is available.
          </p>
          <p className="update-card-label">Run this in your terminal to update:</p>
          <div className="update-cmd">
            <code>{UPGRADE_COMMAND}</code>
            <button
              type="button"
              className="btn small ghost"
              aria-label="copy update command"
              onClick={() => void copyCommand()}
            >
              <Icon name={copied ? "check" : "copy"} />
            </button>
          </div>
          <button
            type="button"
            className="btn small ghost update-notes"
            onClick={() => void sp.app.openReleasePage()}
          >
            <Icon name="externalLink" />
            Release notes
          </button>
        </div>
      )}
    </div>
  );
}
