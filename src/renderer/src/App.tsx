import type { AuthStatus } from "@shared/auth";
import { useEffect, useState } from "react";
import { sp } from "./api";
import { UpdateIndicator } from "./components/UpdateIndicator";
import { AuthGate } from "./screens/AuthGate";
import { Home } from "./screens/Home";
import { Workspace } from "./screens/Workspace";

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  useEffect(() => {
    sp.auth
      .status()
      .then(setAuth)
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await sp.auth.logout();
    setOpenProjectId(null);
    setAuth(await sp.auth.status());
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>Short Pipe</h1>
          <span className="tagline">long-form in, captioned shorts out</span>
        </div>
        <div className="topbar-actions">
          <UpdateIndicator />
          {auth?.authenticated && (
            <button type="button" className="btn small ghost" onClick={logout}>
              Sign out
            </button>
          )}
        </div>
      </div>

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
