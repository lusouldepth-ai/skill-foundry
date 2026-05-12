import {
  Archive,
  Box,
  Check,
  CircleAlert,
  Clock3,
  Edit3,
  Eye,
  Filter,
  Folder,
  Gauge,
  Heart,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SourceKind = "custom" | "system" | "plugin" | "unknown";
type Lifecycle = "active" | "optimize" | "archive" | "quarantined";

interface SkillView {
  id: string;
  name: string;
  description: string;
  directory: string;
  skillFile: string;
  rootLabel: string;
  sourceKind: SourceKind;
  riskLevel: "manageable" | "protected" | "review";
  descriptionMissing: boolean;
  modifiedAt: string;
  sizeBytes: number;
  bodyPreview: string;
  lifecycle: Lifecycle;
  favorite: boolean;
  notes: string;
  lastUsedAt?: string;
  quarantinedAt?: string;
  quarantinePath?: string;
}

interface SkillsResponse {
  scannedAt: string;
  roots: Array<{ label: string; path: string; kind: SourceKind }>;
  skills: SkillView[];
}

interface AppConfig {
  roots: Array<{ label: string; path: string; kind: SourceKind }>;
  dataDir: string;
  quarantineDir: string;
  backupDir: string;
}

const sourceOptions = ["all", "custom", "system", "plugin"] as const;
const lifecycleOptions: Array<Lifecycle | "all" | "stale"> = ["all", "active", "optimize", "archive", "stale"];

export function App() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<(typeof sourceOptions)[number]>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<(typeof lifecycleOptions)[number]>("all");
  const [staleDays, setStaleDays] = useState(60);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Scanning local skills...");

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => void loadSkills(false), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const skills = data?.skills ?? [];
  const selected = skills.find((skill) => skill.id === selectedId) ?? skills[0];

  useEffect(() => {
    if (!selectedId && skills.length > 0) {
      setSelectedId(skills[0].id);
    }
  }, [selectedId, skills]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    void loadContent(selected.id);
    setNoteDraft(selected.notes);
    setEditing(false);
  }, [selected?.id]);

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const searchable = `${skill.name} ${skill.description} ${skill.directory} ${skill.rootLabel} ${skill.notes}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesSource = sourceFilter === "all" || skill.sourceKind === sourceFilter;
      const stale = isStale(skill, staleDays);
      const matchesLifecycle =
        lifecycleFilter === "all" ||
        (lifecycleFilter === "stale" ? stale : skill.lifecycle === lifecycleFilter);
      return matchesQuery && matchesSource && matchesLifecycle;
    });
  }, [skills, query, sourceFilter, lifecycleFilter, staleDays]);

  const metrics = useMemo(() => {
    const custom = skills.filter((skill) => skill.sourceKind === "custom").length;
    const protectedCount = skills.filter((skill) => skill.riskLevel === "protected").length;
    const optimize = skills.filter((skill) => skill.lifecycle === "optimize").length;
    const stale = skills.filter((skill) => isStale(skill, staleDays)).length;
    const missing = skills.filter((skill) => skill.descriptionMissing).length;
    return { total: skills.length, custom, protectedCount, optimize, stale, missing };
  }, [skills, staleDays]);

  async function loadAll() {
    await Promise.all([loadSkills(true), loadConfig()]);
  }

  async function loadConfig() {
    const response = await fetch("/api/config");
    setConfig(await response.json());
  }

  async function loadSkills(showNotice: boolean) {
    if (showNotice) {
      setBusy(true);
    }
    try {
      const response = await fetch("/api/skills");
      const nextData = (await response.json()) as SkillsResponse;
      setData(nextData);
      setNotice(`Synced ${nextData.skills.length} skills at ${formatTime(nextData.scannedAt)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadContent(id: string) {
    const response = await fetch(`/api/skills/${encodeURIComponent(id)}/content`);
    if (!response.ok) {
      setContent("");
      setDraftContent("");
      return;
    }
    const body = (await response.json()) as { content: string };
    setContent(body.content);
    setDraftContent(body.content);
  }

  async function patchState(id: string, patch: Partial<SkillView>) {
    setBusy(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(id)}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const nextData = (await response.json()) as SkillsResponse;
      setData(nextData);
      setNotice("State saved");
    } finally {
      setBusy(false);
    }
  }

  async function saveContent() {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(selected.id)}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draftContent })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Save failed");
      }
      setContent(draftContent);
      setEditing(false);
      setNotice(`Saved with backup at ${body.result.backupPath}`);
      await loadSkills(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function quarantineSelected() {
    if (!selected) {
      return;
    }
    const confirmed = window.confirm(`Move "${selected.name}" to quarantine? This is reversible from ${config?.quarantineDir ?? "data/quarantine"}.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(selected.id)}/quarantine`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Quarantine failed");
      }
      setData(body.skills);
      setSelectedId(null);
      setNotice(`Moved to quarantine: ${body.result.destination}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quarantine failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Local skill operations</div>
          <h1>Skill Foundry</h1>
        </div>
        <div className="topbar-actions">
          <div className="scan-status">
            <Gauge size={16} />
            <span>{notice}</span>
          </div>
          <button className="icon-button text-button" onClick={() => loadSkills(true)} disabled={busy} title="Sync local skills">
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            Sync
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="control-rail">
          <div className="metric-grid">
            <Metric label="Total" value={metrics.total} icon={<Box size={18} />} />
            <Metric label="Custom" value={metrics.custom} icon={<Edit3 size={18} />} />
            <Metric label="Protected" value={metrics.protectedCount} icon={<Shield size={18} />} />
            <Metric label="Stale" value={metrics.stale} icon={<Clock3 size={18} />} />
            <Metric label="Optimize" value={metrics.optimize} icon={<Sparkles size={18} />} />
            <Metric label="Missing" value={metrics.missing} icon={<CircleAlert size={18} />} />
          </div>

          <div className="filter-block">
            <label className="field-label" htmlFor="search">
              <Search size={14} />
              Search
            </label>
            <input
              id="search"
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="name, path, note"
            />
          </div>

          <FilterGroup label="Source" icon={<Folder size={14} />}>
            {sourceOptions.map((option) => (
              <button
                key={option}
                className={sourceFilter === option ? "seg active" : "seg"}
                onClick={() => setSourceFilter(option)}
              >
                {option}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label="Lifecycle" icon={<Filter size={14} />}>
            {lifecycleOptions.map((option) => (
              <button
                key={option}
                className={lifecycleFilter === option ? "seg active" : "seg"}
                onClick={() => setLifecycleFilter(option)}
              >
                {option}
              </button>
            ))}
          </FilterGroup>

          <div className="filter-block">
            <div className="field-label">
              <Clock3 size={14} />
              Stale threshold
            </div>
            <div className="threshold-row">
              {[30, 60, 90].map((days) => (
                <button key={days} className={staleDays === days ? "seg active" : "seg"} onClick={() => setStaleDays(days)}>
                  {days}d
                </button>
              ))}
            </div>
          </div>

          <div className="path-panel">
            <div className="panel-title">Scan roots</div>
            {(config?.roots ?? data?.roots ?? []).map((root) => (
              <div className="root-line" key={`${root.label}:${root.path}`}>
                <span>{root.kind}</span>
                <code>{root.path}</code>
              </div>
            ))}
          </div>
        </aside>

        <section className="skill-board">
          <div className="board-header">
            <div>
              <div className="board-kicker">{filteredSkills.length} visible</div>
              <h2>Inventory</h2>
            </div>
            <div className="policy-strip">
              <Shield size={15} />
              Permanent delete disabled · protected sources read-only
            </div>
          </div>

          <div className="skill-grid">
            {filteredSkills.map((skill) => (
              <button
                key={skill.id}
                className={selected?.id === skill.id ? "skill-card selected" : "skill-card"}
                onClick={() => setSelectedId(skill.id)}
              >
                <div className={`plate ${skill.sourceKind}`}>
                  <span>{initials(skill.name)}</span>
                </div>
                <div className="skill-card-body">
                  <div className="skill-card-top">
                    <strong>{skill.name}</strong>
                    {skill.favorite ? <Star size={15} fill="currentColor" /> : null}
                  </div>
                  <p>{skill.description || "No description provided."}</p>
                  <div className="tags">
                    <span>{skill.sourceKind}</span>
                    <span>{skill.lifecycle}</span>
                    {isStale(skill, staleDays) ? <span className="warn">stale</span> : null}
                    {skill.descriptionMissing ? <span className="warn">missing description</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="detail-drawer">
          {selected ? (
            <>
              <div className="detail-heading">
                <div className={`plate large ${selected.sourceKind}`}>
                  <span>{initials(selected.name)}</span>
                </div>
                <div>
                  <div className="eyebrow">{selected.rootLabel}</div>
                  <h2>{selected.name}</h2>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="icon-button"
                  title="Favorite"
                  onClick={() => patchState(selected.id, { favorite: !selected.favorite })}
                >
                  <Heart size={16} fill={selected.favorite ? "currentColor" : "none"} />
                </button>
                <button
                  className="icon-button"
                  title="Mark used today"
                  onClick={() => patchState(selected.id, { lastUsedAt: new Date().toISOString(), lifecycle: "active" })}
                >
                  <Check size={16} />
                </button>
                <button
                  className="icon-button danger"
                  title="Move custom skill to quarantine"
                  onClick={quarantineSelected}
                  disabled={selected.riskLevel === "protected"}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="lifecycle-control">
                {(["active", "optimize", "archive"] as Lifecycle[]).map((lifecycle) => (
                  <button
                    key={lifecycle}
                    className={selected.lifecycle === lifecycle ? "seg active" : "seg"}
                    onClick={() => patchState(selected.id, { lifecycle })}
                  >
                    {lifecycle === "archive" ? <Archive size={14} /> : null}
                    {lifecycle}
                  </button>
                ))}
              </div>

              <div className="meta-list">
                <Meta label="Path" value={selected.skillFile} />
                <Meta label="Modified" value={formatDate(selected.modifiedAt)} />
                <Meta label="Last used" value={selected.lastUsedAt ? formatDate(selected.lastUsedAt) : "manual marker not set"} />
                <Meta label="Size" value={`${Math.round(selected.sizeBytes / 10.24) / 100} KB`} />
              </div>

              <label className="notes-label" htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                className="notes"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => {
                  if (noteDraft !== selected.notes) {
                    void patchState(selected.id, { notes: noteDraft });
                  }
                }}
                placeholder="Add maintenance notes"
              />

              <div className="editor-header">
                <div>
                  <div className="panel-title">SKILL.md</div>
                  <span>{selected.riskLevel === "protected" ? "Read-only protected source" : "Editable with automatic backup"}</span>
                </div>
                <div className="editor-actions">
                  {editing ? (
                    <>
                      <button className="icon-button" title="Cancel" onClick={() => { setEditing(false); setDraftContent(content); }}>
                        <X size={16} />
                      </button>
                      <button className="icon-button accent" title="Save" onClick={saveContent} disabled={busy}>
                        <Save size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-button"
                      title="Edit custom skill"
                      onClick={() => setEditing(true)}
                      disabled={selected.riskLevel === "protected"}
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {editing ? (
                <textarea className="skill-editor" value={draftContent} onChange={(event) => setDraftContent(event.target.value)} />
              ) : (
                <pre className="skill-preview">
                  <code>{previewContent(content || selected.bodyPreview)}</code>
                </pre>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Eye size={24} />
              <p>No skill selected.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="metric">
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function FilterGroup({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="filter-block">
      <div className="field-label">
        {icon}
        {label}
      </div>
      <div className="seg-row">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function isStale(skill: SkillView, thresholdDays: number): boolean {
  const anchor = new Date(skill.lastUsedAt ?? skill.modifiedAt).getTime();
  return Number.isFinite(anchor) && Date.now() - anchor > thresholdDays * 24 * 60 * 60 * 1000;
}

function initials(name: string): string {
  return name
    .split(/[-_\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(new Date(value));
}

function previewContent(value: string): string {
  if (value.length <= 6000) {
    return value;
  }
  return `${value.slice(0, 6000)}\n\n[Preview truncated. Enter edit mode to load and save the full file.]`;
}
