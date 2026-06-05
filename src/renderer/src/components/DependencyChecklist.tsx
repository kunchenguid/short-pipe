import type { DependencyStatus } from "@shared/deps";
import { useCallback, useEffect, useRef, useState } from "react";
import { sp } from "../api";
import { Icon } from "./Icon";

/**
 * Startup readiness panel for the external CLI tools the on-device pipeline
 * shells out to (ffmpeg/ffprobe/hyperframes). Shows each tool's status and, when
 * one is missing, the install command and a setup link - so the user can fix
 * PATH before a transcription or render fails mid-run.
 *
 * The probe is re-run whenever the window regains focus (the natural moment
 * after a user installs a tool in their terminal and switches back) and on a
 * manual "Re-check", so a freshly-installed tool flips to ready without an app
 * restart.
 */
export function DependencyChecklist() {
  const [deps, setDeps] = useState<DependencyStatus[] | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const checkRequestId = useRef(0);

  const check = useCallback(async () => {
    const requestId = checkRequestId.current + 1;
    checkRequestId.current = requestId;
    setRechecking(true);
    setCheckError(false);
    try {
      const nextDeps = await sp.deps.check();
      if (checkRequestId.current === requestId) {
        setDeps(nextDeps);
      }
    } catch {
      if (checkRequestId.current === requestId) {
        setCheckError(true);
        setDeps(null);
      }
    } finally {
      if (checkRequestId.current === requestId) {
        setRechecking(false);
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check]);

  if (checkError) {
    return (
      <div className="dep-check">
        <div className="dep-check-head">
          <span className="dep-check-title">On-device tools</span>
          <div className="dep-check-meta">
            <span className="dep-summary missing">Check failed</span>
            <button
              type="button"
              className="dep-recheck"
              onClick={() => void check()}
              disabled={rechecking}
            >
              {rechecking ? <span className="spinner" /> : <Icon name="rotateCw" />}
              Re-check
            </button>
          </div>
        </div>
        <p className="dep-desc">
          Unable to check tools. Re-check after confirming the app can access your shell.
        </p>
      </div>
    );
  }

  if (!deps) {
    return (
      <div className="dep-check loading">
        <span className="spinner" /> Checking on-device tools...
      </div>
    );
  }

  const missing = deps.filter((d) => !d.available).length;

  return (
    <div className="dep-check">
      <div className="dep-check-head">
        <span className="dep-check-title">On-device tools</span>
        <div className="dep-check-meta">
          <span className={`dep-summary ${missing === 0 ? "ok" : "missing"}`}>
            {missing === 0 ? "All set" : `${missing} missing`}
          </span>
          <button
            type="button"
            className="dep-recheck"
            onClick={() => void check()}
            disabled={rechecking}
          >
            {rechecking ? <span className="spinner" /> : <Icon name="rotateCw" />}
            Re-check
          </button>
        </div>
      </div>
      <ul className="dep-list">
        {deps.map((dep) => (
          <li key={dep.id} className={`dep-row ${dep.available ? "ok" : "missing"}`}>
            <Icon name={dep.available ? "checkCircle" : "x"} className="dep-status-icon" />
            <div className="dep-body">
              <div className="dep-name">
                <span>{dep.label}</span>
                {dep.available ? (
                  dep.version && <span className="mono dep-version">{dep.version}</span>
                ) : (
                  <span className="dep-badge">Not found</span>
                )}
              </div>
              <p className="dep-desc">{dep.description}</p>
              {!dep.available && (
                <div className="dep-setup">
                  <code className="dep-cmd">{dep.installCommand}</code>
                  <button
                    type="button"
                    className="dep-link"
                    onClick={() => void sp.app.openExternal(dep.setupUrl)}
                  >
                    Setup guide <Icon name="externalLink" />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
