/* Short Pipe UI kit — screens. Depends on data.jsx globals. */
const { useState, useEffect, useRef } = React;

/* ---------- caption rendering ---------- */
function CaptionLine({ candidate, style }) {
  const words = candidate.title.split(" ");
  const kwTokens = new Set(
    candidate.keywords.join(" ").toLowerCase().split(/\s+/).filter(Boolean)
  );
  const lit = Math.ceil(words.length * 0.6);
  const clean = (w) => w.replace(/[^a-zA-Z0-9']/g, "").toLowerCase();
  return (
    <div className={"cap " + style.captionStyle}>
      {words.map((w, i) => {
        const isKw = kwTokens.has(clean(w));
        const dim = style.captionStyle === "karaoke" && i >= lit;
        const cls = [isKw ? "kw" : "", dim ? "dim" : ""].filter(Boolean).join(" ");
        return <span key={i} className={cls}>{w}{i < words.length - 1 ? " " : ""}</span>;
      })}
    </div>
  );
}

/* ---------- Auth ---------- */
function AuthGate({ onAuthed }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <div className="panel card">
        <div className="seal"><Icon name="shield" /></div>
        <h2>Connect Codex</h2>
        <p>Short Pipe runs the agent on your own Codex subscription. Sign in once - your video and transcripts never leave this machine.</p>
        <button className="btn primary block" disabled={busy}
          onClick={() => { setBusy(true); setTimeout(onAuthed, 850); }}>
          {busy ? <><Spinner /> Waiting for browser sign-in...</> : "Sign in with Codex"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Library ---------- */
function ProjectTile({ p, onOpen }) {
  const label = p.status === "ready" ? "transcribed" : p.status === "running" ? "transcribing" : p.status === "none" ? "not transcribed" : p.status;
  return (
    <button className="card project-tile" onClick={() => onOpen(p)}>
      <div className="tile-poster">
        <Icon name="play" />
        <span className="dur">{p.dur}</span>
      </div>
      <div className="tile-body">
        <h3>{p.title}</h3>
        <div className="tile-meta">
          <Pill status={p.status === "none" ? "none" : p.status}>{label}</Pill>
          <span>{p.count} {p.count === 1 ? "short" : "shorts"}</span>
        </div>
      </div>
    </button>
  );
}

function Library({ onOpen }) {
  return (
    <div className="library">
      <div className="library-head">
        <h2>Your projects</h2>
        <button className="btn primary" onClick={() => onOpen(PROJECTS[2])}>
          <Icon name="plus" /> New project from video
        </button>
      </div>
      <div className="project-grid">
        <button className="dropzone" onClick={() => onOpen(PROJECTS[2])}>
          <Icon name="upload" />
          <div style={{ fontWeight: 600, color: "var(--ink-2)" }}>Drop a long-form video</div>
          <div style={{ fontSize: 12 }}>It stays on your disk. Nothing uploads.</div>
        </button>
        {PROJECTS.map((p) => <ProjectTile key={p.id} p={p} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

/* ---------- Filmstrip ---------- */
function Clip({ c, style, active, onSelect }) {
  const short = c.title.length > 26 ? c.title.slice(0, 24) + "…" : c.title;
  return (
    <button className={"clip" + (active ? " active" : "")} onClick={onSelect}>
      <div className={"clip-poster" + (style.layout === "card" ? " card-layout" : "")}>
        <span className="rnk">{c.rank}</span>
        <span className="mini-cap">{c.keywords[0]}</span>
      </div>
      <div className="clip-info">
        <span className="ct">{c.title}</span>
        <span className="cm">{fmt(timeOf(WORDS[c.s].id, "start"))}–{fmt(timeOf(WORDS[c.e].id, "end"))} · {(timeOf(WORDS[c.e].id, "end") - timeOf(WORDS[c.s].id, "start")).toFixed(1)}s</span>
        <Pill status={c.status} />
      </div>
    </button>
  );
}

function Filmstrip({ candidates, style, selectedId, onSelect, onFind }) {
  return (
    <div className="pane filmstrip">
      <div className="pane-head">
        <span className="section-title">Shorts · {candidates.length}</span>
        <button className="btn ghost small" onClick={onFind} title="Re-run the agent">
          <Icon name="sparkles" />
        </button>
      </div>
      <div className="pane-scroll">
        <div className="strip">
          {candidates.map((c) => (
            <Clip key={c.id} c={c} style={style} active={c.id === selectedId} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Stage: live preview ---------- */
function StagePreview({ candidate, style }) {
  const [playing, setPlaying] = useState(false);
  const dur = (timeOf(WORDS[candidate.e].id, "end") - timeOf(WORDS[candidate.s].id, "start"));
  const fillRef = useRef(null);
  useEffect(() => {
    const el = fillRef.current; if (!el) return;
    if (playing) {
      el.style.transition = "none"; el.style.width = "0%";
      requestAnimationFrame(() => { el.style.transition = `width ${dur}s linear`; el.style.width = "100%"; });
      const t = setTimeout(() => setPlaying(false), dur * 1000);
      return () => clearTimeout(t);
    } else {
      el.style.transition = "width 0.2s var(--ease)"; el.style.width = "0%";
    }
  }, [playing, candidate.id, dur]);
  return (
    <div className="stage-scroll">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className={"phone layout-" + (style.layout === "card" ? "card" : "fullbleed")}>
          <div className="video"><div className="grain" /></div>
          {!playing && <button className="play" onClick={() => setPlaying(true)}><Icon name="play" /></button>}
          {playing && <button className="play" onClick={() => setPlaying(false)} style={{ opacity: 0 }}><Icon name="pause" /></button>}
          <CaptionLine candidate={candidate} style={style} />
        </div>
        <div className="scrubber">
          <span className="tc">0:00</span>
          <div className="track"><div className="fill" ref={fillRef} /></div>
          <span className="tc">{dur.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Inspector (per-candidate: content only) ---------- */
const KW_POOL = ["runway", "truth", "math", "survival", "forecast", "early"];
function Inspector({ candidate, passage, onPatch, onTrim }) {
  const removeKw = (k) => onPatch({ keywords: candidate.keywords.filter((x) => x !== k) });
  const addKw = () => {
    const next = KW_POOL.find((k) => !candidate.keywords.includes(k));
    if (next) onPatch({ keywords: [...candidate.keywords, next] });
  };
  const approved = candidate.status === "approved" || candidate.status === "rendered";
  const rendered = candidate.status === "rendered";
  const dur = (WORDS[candidate.e].end - WORDS[candidate.s].start);
  return (
    <div className="pane inspector">
      <div className="pane-head"><span className="section-title">Inspector</span><Pill status={candidate.status} /></div>
      <div className="insp">
        <div className="ttl">{candidate.title}</div>
        <div className="reason">{candidate.reason}</div>
        <div className="passage">“{passage}”</div>
        <div className="meta-line">
          <span>{fmt(WORDS[candidate.s].start)} – {fmt(WORDS[candidate.e].end)}</span>
          <span>·</span><span>{dur.toFixed(1)}s</span>
          <span>·</span><span>{candidate.e - candidate.s + 1} words</span>
        </div>
        <div className="divider" />

        <div className="field-group">
          <label>Keywords</label>
          <div className="kw-edit">
            {candidate.keywords.map((k) => (
              <span key={k} className="kw-chip">{k}<button onClick={() => removeKw(k)}><Icon name="x" /></button></span>
            ))}
            <button className="kw-add" onClick={addKw}>+ add</button>
          </div>
        </div>

        <button className="btn block" onClick={onTrim}><Icon name="scissors" /> Trim by words</button>
        <div className="divider" />

        <div className="actions">
          {!approved && (
            <div className="row2">
              <button className="btn primary" onClick={() => onPatch({ status: "approved" })}><Icon name="check" /> Approve</button>
              <button className="btn" onClick={() => onPatch({ status: "rejected" })}>Reject</button>
            </div>
          )}
          {approved && (
            <button className="btn accent block" onClick={() => onPatch({ status: "rendered" })}>
              <Icon name={rendered ? "rotateCw" : "film"} /> {rendered ? "Re-render" : "Render 1080×1920"}
            </button>
          )}
          {rendered && (
            <div className="rendered-note"><Icon name="checkCircle" /> shorts/seed-ama/{candidate.id}.mp4</div>
          )}
          {candidate.status === "rejected" && (
            <button className="btn ghost block" onClick={() => onPatch({ status: "proposed" })}>Restore</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Transcript trim ----------
   Highlight-to-select: drag across the words you want (like quoting a passage),
   then drag either rounded handle to nudge an edge. No "active boundary" mode. */
function TranscriptTrim({ candidate, onSave, onCancel }) {
  const [s, setS] = useState(candidate.s);
  const [e, setE] = useState(candidate.e);
  const drag = useRef(null);      // "new" | "start" | "end" | null
  const anchor = useRef(candidate.s);
  const startRef = useRef(null);

  useEffect(() => { startRef.current && startRef.current.scrollIntoView({ block: "center" }); }, []);
  useEffect(() => {
    const up = () => { drag.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const beginSelect = (i) => { drag.current = "new"; anchor.current = i; setS(i); setE(i); document.body.style.userSelect = "none"; };
  const grabHandle = (which) => (ev) => { ev.stopPropagation(); drag.current = which; document.body.style.userSelect = "none"; };
  const onEnter = (i) => {
    if (!drag.current) return;
    if (drag.current === "new") { setS(Math.min(anchor.current, i)); setE(Math.max(anchor.current, i)); }
    else if (drag.current === "start") setS(Math.min(i, e));
    else if (drag.current === "end") setE(Math.max(i, s));
  };
  const dur = (WORDS[e].end - WORDS[s].start);
  const count = e - s + 1;

  return (
    <div className="trim">
      <div className="work-bar">
        <button className="btn small ghost" onClick={onCancel}><Icon name="chevronLeft" /> Back to preview</button>
        <span className="section-title" style={{ marginLeft: 8 }}>Trim · {candidate.title}</span>
        <span className="spacer" />
        <button className="btn small primary" onClick={() => onSave({ s, e })}><Icon name="check" /> Save range</button>
      </div>
      <div className="trim-controls">
        <div className="trim-summary">
          <span className="ts-words"><strong>{count}</strong> words selected</span>
          <span className="ts-dot">·</span>
          <span>{fmt(WORDS[s].start)} – {fmt(WORDS[e].end)}</span>
          <span className="ts-dot">·</span>
          <span className="ts-dur">{dur.toFixed(1)}s</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="transcript">
          {WORDS.map((w, i) => {
            const inR = i >= s && i <= e;
            const cls = ["word", inR ? "in-range" : "", i === s ? "is-start" : "", i === e ? "is-end" : ""].filter(Boolean).join(" ");
            return (
              <span
                key={w.id}
                ref={i === s ? startRef : null}
                className={cls}
                onMouseDown={() => beginSelect(i)}
                onMouseEnter={() => onEnter(i)}
              >
                {i === s && <span className="grip grip-start" onMouseDown={grabHandle("start")} title="Drag to move the start" />}
                {w.text}
                {i === e && <span className="grip grip-end" onMouseDown={grabHandle("end")} title="Drag to move the end" />}
                {" "}
              </span>
            );
          })}
        </div>
      </div>
      <div className="trim-hint"><strong>Drag across the transcript</strong> to select your clip — like quoting a passage — then grab either handle to nudge an edge.</div>
    </div>
  );
}

/* ---------- Agent empty / running ---------- */
function AgentEmpty({ status, onRun, running, step }) {
  const label = status === "ready" ? "Find shorts with AI" : "Transcribe & find shorts";
  return (
    <div className="stage-scroll">
      <div className="runner-empty">
        <div className="ic"><Icon name="sparkles" /></div>
        <h3>Let the agent find your shorts</h3>
        <p>It reads the transcript on your Codex plan and proposes ranked soundbites into the filmstrip. Nothing leaves this machine.</p>
        {running
          ? <div className="runner-status"><Spinner /> {step}</div>
          : <button className="btn primary" onClick={onRun}><Icon name="sparkles" /> {label}</button>}
      </div>
    </div>
  );
}

/* ---------- Project style bar (global — applies to every short) ---------- */
function StyleBar({ style, onChange }) {
  return (
    <div className="style-bar">
      <span className="sb-label">Style · all shorts</span>
      <div className="sb-group">
        <span className="sb-sub"><Icon name="layout" /> Layout</span>
        <div className="seg sb-seg">
          <button className={style.layout === "card" ? "on" : ""} onClick={() => onChange({ layout: "card" })}>card</button>
          <button className={style.layout === "full-bleed" ? "on" : ""} onClick={() => onChange({ layout: "full-bleed" })}>full-bleed</button>
        </div>
      </div>
      <div className="sb-group">
        <span className="sb-sub"><Icon name="captions" /> Captions</span>
        <div className="seg sb-seg">
          <button className={style.captionStyle === "clean" ? "on" : ""} onClick={() => onChange({ captionStyle: "clean" })}>clean</button>
          <button className={style.captionStyle === "karaoke" ? "on" : ""} onClick={() => onChange({ captionStyle: "karaoke" })}>karaoke</button>
          <button className={style.captionStyle === "bold-pop" ? "on" : ""} onClick={() => onChange({ captionStyle: "bold-pop" })}>bold-pop</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Editor ---------- */
function Editor({ project, onBack, initialMode }) {
  const [candidates, setCandidates] = useState(() => project.status === "ready" ? CANDIDATES.map((c) => ({ ...c })) : []);
  const [selectedId, setSelectedId] = useState(() => project.status === "ready" ? CANDIDATES[0].id : null);
  const [style, setStyle] = useState({ layout: "full-bleed", captionStyle: "bold-pop" });
  const [mode, setMode] = useState(initialMode || "review");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(STEPS[0]);

  const selected = candidates.find((c) => c.id === selectedId) || null;
  const passageOf = (c) => WORDS.slice(c.s, c.e + 1).map((w) => w.text).join(" ");

  function runAgent() {
    setMode("review");
    setRunning(true);
    let i = 0;
    setStep(STEPS[0]);
    const iv = setInterval(() => {
      i++;
      if (i < STEPS.length) { setStep(STEPS[i]); }
      else {
        clearInterval(iv);
        setRunning(false);
        setCandidates(CANDIDATES.map((c) => ({ ...c })));
        setSelectedId(CANDIDATES[0].id);
      }
    }, 720);
  }

  function patch(p) {
    setCandidates((cs) => cs.map((c) => (c.id === selectedId ? { ...c, ...p } : c)));
  }
  function saveRange({ s, e }) { patch({ s, e }); setMode("review"); }

  const specs = `${project.w}×${project.h} · ${project.fps}fps · ${project.dur}`;

  return (
    <>
      <div className="work-bar">
        <button className="btn small ghost" onClick={onBack}><Icon name="chevronLeft" /> Projects</button>
        <span className="file" style={{ marginLeft: 8 }}>
          <Icon name="fileVideo" style={{ color: "var(--ink-3)" }} />
          <span className="name">{project.title}</span>
        </span>
        <span className="specs">{specs}</span>
        <span className="spacer" />
        <button className="btn small"><Icon name="folderOpen" /> Output folder</button>
      </div>
      {mode !== "trim" && <StyleBar style={style} onChange={(p) => setStyle((s) => ({ ...s, ...p }))} />}
      <div className="editor">
        <Filmstrip candidates={candidates} style={style} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setMode("review"); }} onFind={runAgent} />
        <div className="pane stage">
          {mode === "trim" && selected
            ? <TranscriptTrim candidate={selected} onSave={saveRange} onCancel={() => setMode("review")} />
            : selected
              ? <StagePreview candidate={selected} style={style} />
              : <AgentEmpty status={project.status} onRun={runAgent} running={running} step={step} />}
        </div>
        {selected && mode !== "trim"
          ? <Inspector candidate={selected} passage={passageOf(selected)} onPatch={patch} onTrim={() => setMode("trim")} />
          : <div className="pane inspector"><div className="pane-head"><span className="section-title">Inspector</span></div>
              <div className="insp"><p className="muted" style={{ fontSize: 13 }}>{mode === "trim" ? "Trimming…" : "Run the agent to propose shorts, then select one to inspect."}</p></div></div>}
      </div>
    </>
  );
}

/* ---------- App ---------- */
function App() {
  const init = (typeof window !== "undefined" && window.__SP_INITIAL) || {};
  const [screen, setScreen] = useState(init.screen || "auth");
  const [project, setProject] = useState(init.project != null ? PROJECTS[init.project] : null);
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>Short Pipe</h1>
          <span className="tagline">long-form in, captioned shorts out</span>
        </div>
        {screen !== "auth" && (
          <button className="btn small ghost" onClick={() => { setScreen("auth"); setProject(null); }}>Sign out</button>
        )}
      </div>
      {screen === "auth" && <AuthGate onAuthed={() => setScreen("library")} />}
      {screen === "library" && <Library onOpen={(p) => { setProject(p); setScreen("editor"); }} />}
      {screen === "editor" && project && <Editor project={project} initialMode={init.mode} onBack={() => setScreen("library")} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
