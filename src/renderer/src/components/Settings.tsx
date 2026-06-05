import type { ShortPipeConfig } from "@shared/config";
import type { CaptionStyle, LayoutKind, Theme } from "@shared/project";
import { CAPTION_STYLES, LAYOUT_KINDS, THEMES } from "@shared/project";
import { useEffect, useState } from "react";
import { sp } from "../api";
import { Icon } from "./Icon";

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "top-square": "Half & half",
  "center-square": "Center",
  "full-bleed": "Full bleed",
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
};

const CAPTION_LABELS: Record<CaptionStyle, string> = {
  clean: "clean",
  karaoke: "karaoke",
  "bold-pop": "bold-pop",
};

/**
 * App-global settings, reached from the gear in the topbar. Sets the default
 * output folder for rendered shorts and the layout/theme/caption defaults the
 * agent starts new proposals from. Renders as a modal sheet over the app.
 */
export function Settings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ShortPipeConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sp.settings
      .get()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function call(fn: () => Promise<ShortPipeConfig>) {
    setBusy(true);
    setError(null);
    try {
      setConfig(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: Parameters<typeof sp.settings.update>[0]) =>
    call(() => sp.settings.update(patch));

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-sheet">
        <div className="settings-head">
          <span className="section-title">Settings</span>
          <button
            type="button"
            className="btn small ghost"
            aria-label="Close settings"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </div>

        {!config ? (
          <div className="settings-body">
            {error ? <div className="banner error">{error}</div> : <span className="spinner" />}
          </div>
        ) : (
          <div className="settings-body">
            <div className="field-group">
              <span className="fg-label">Output folder</span>
              <p className="settings-hint">Where exported shorts are saved across every project.</p>
              <div className="settings-path">
                <Icon name="folderOpen" style={{ color: "var(--ink-3)" }} />
                <span className="path-text">
                  {config.defaultOutputDir ?? "Each project's own folder"}
                </span>
              </div>
              <div className="row2">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void call(() => sp.settings.chooseOutputDir())}
                >
                  <Icon name="folderOpen" /> Choose folder
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !config.defaultOutputDir}
                  onClick={() => void update({ defaultOutputDir: "" })}
                >
                  Use project folder
                </button>
              </div>
            </div>

            <div className="divider" />

            <p className="settings-hint">
              Defaults the agent starts new shorts from. You can still change any short in the
              inspector.
            </p>

            <div className="field-group">
              <span className="fg-label">Layout</span>
              <div className="seg">
                {LAYOUT_KINDS.map((l) => (
                  <button
                    type="button"
                    key={l}
                    disabled={busy}
                    className={config.defaultLayout === l ? "on" : ""}
                    onClick={() => void update({ defaultLayout: l })}
                  >
                    {LAYOUT_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="fg-label">Theme</span>
              <div className="seg">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    disabled={busy}
                    className={config.defaultTheme === t ? "on" : ""}
                    onClick={() => void update({ defaultTheme: t })}
                  >
                    {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="fg-label">Captions</span>
              <div className="seg">
                {CAPTION_STYLES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    disabled={busy}
                    className={config.defaultCaptionStyle === c ? "on" : ""}
                    onClick={() => void update({ defaultCaptionStyle: c })}
                  >
                    {CAPTION_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="banner error">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
