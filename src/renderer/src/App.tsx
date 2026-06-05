import type { AuthStatus } from "@shared/auth";
import { useEffect, useState } from "react";
import { sp } from "./api";
import { Icon } from "./components/Icon";
import { Settings } from "./components/Settings";
import { UpdateIndicator } from "./components/UpdateIndicator";
import { AuthGate } from "./screens/AuthGate";
import { Home } from "./screens/Home";
import { Workspace } from "./screens/Workspace";

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    sp.auth
      .status()
      .then(setAuth)
      .finally(() => setLoading(false));
  }, []);

  // Sign out of Codex and drop back to the connect screen. Closing any open
  // project and clearing auth flips the app back to the AuthGate.
  async function signOut() {
    await sp.auth.logout();
    setSettingsOpen(false);
    setOpenProjectId(null);
    setAuth(null);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>Short Pipe</h1>
          <span className="tagline">long-form in, captioned shorts out</span>
        </div>
        <div className="topbar-actions">
          {auth?.authenticated && (
            <button
              type="button"
              className="btn small ghost icon-only"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="settings" />
            </button>
          )}
          <UpdateIndicator />
        </div>
      </div>

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} onSignOut={() => void signOut()} />
      )}

      {loading ? (
        <div className="center-screen">
          <span className="spinner" />
        </div>
      ) : !auth?.authenticated ? (
        <AuthGate onAuthed={setAuth} />
      ) : openProjectId ? (
        <Workspace projectId={openProjectId} onBack={() => setOpenProjectId(null)} />
      ) : (
        <Home onOpen={setOpenProjectId} />
      )}
    </div>
  );
}
