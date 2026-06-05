import type { AuthStatus } from "@shared/auth";
import { useState } from "react";
import { sp } from "../api";
import { DependencyChecklist } from "../components/DependencyChecklist";
import { Icon, Spinner } from "../components/Icon";

export function AuthGate({ onAuthed }: { onAuthed: (status: AuthStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const status = await sp.auth.login();
      if (status.authenticated) onAuthed(status);
      else setError(status.error ?? "Sign-in did not complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="panel card">
        <div className="seal">
          <Icon name="shield" />
        </div>
        <h2>Connect Codex</h2>
        <p>
          Short Pipe runs the agent on your own Codex subscription. Sign in once - your video and
          transcripts never leave this machine.
        </p>
        {error && <div className="banner error">{error}</div>}
        <button type="button" className="btn primary block" onClick={login} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Waiting for browser sign-in...
            </>
          ) : (
            "Sign in with Codex"
          )}
        </button>
        <DependencyChecklist />
      </div>
    </div>
  );
}
