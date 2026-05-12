import {
  Archive,
  Blocks,
  Box,
  Bot,
  Braces,
  Brush,
  Check,
  CircleAlert,
  Clock3,
  Database,
  Edit3,
  Eye,
  FileText,
  Filter,
  Folder,
  Gauge,
  Globe2,
  Heart,
  Languages,
  Mail,
  MonitorPlay,
  Network,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sparkles,
  Star,
  TerminalSquare,
  Trash2,
  Workflow,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDefaultLanguage, t, type I18nKey, type Language } from "./i18n";
import { getSkillVisual, type SkillVisualIcon } from "./skillVisuals";

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
const initialLanguage = getInitialLanguage();

export function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
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
  const [notice, setNotice] = useState(t(initialLanguage, "status.scanning"));

  const tr = (key: I18nKey, values?: Record<string, string | number>) => t(language, key, values);

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => void loadSkills(false), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem("skill-foundry-language", language);
    if (data) {
      setNotice(t(language, "status.synced", { count: data.skills.length, time: formatTime(data.scannedAt, language) }));
    }
  }, [language]);

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
      setNotice(t(language, "status.synced", { count: nextData.skills.length, time: formatTime(nextData.scannedAt, language) }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(language, "status.scanFailed"));
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
      setNotice(t(language, "status.saved"));
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
        throw new Error(body.error ?? t(language, "status.scanFailed"));
      }
      setContent(draftContent);
      setEditing(false);
      setNotice(t(language, "status.savedBackup", { path: body.result.backupPath }));
      await loadSkills(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(language, "status.scanFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function quarantineSelected() {
    if (!selected) {
      return;
    }
    const confirmed = window.confirm(
      t(language, "confirm.quarantine", { name: selected.name, path: config?.quarantineDir ?? "data/quarantine" })
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(selected.id)}/quarantine`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? t(language, "status.scanFailed"));
      }
      setData(body.skills);
      setSelectedId(null);
      setNotice(t(language, "status.quarantined", { path: body.result.destination }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(language, "status.scanFailed"));
    } finally {
      setBusy(false);
    }
  }

  function startEditingSelected() {
    if (!selected) {
      return;
    }
    if (selected.riskLevel === "protected" && !window.confirm(t(language, "confirm.protectedEdit"))) {
      return;
    }
    setEditing(true);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr("app.eyebrow")}</div>
          <h1>{tr("app.title")}</h1>
        </div>
        <div className="topbar-actions">
          <div className="scan-status">
            <Gauge size={16} />
            <span>{notice}</span>
          </div>
          <div className="language-switch" aria-label="Language switch">
            {(["zh", "en"] as Language[]).map((option) => (
              <button
                key={option}
                className={language === option ? "seg active" : "seg"}
                onClick={() => setLanguage(option)}
              >
                <Languages size={14} />
                {t(language, option === "zh" ? "language.zh" : "language.en")}
              </button>
            ))}
          </div>
          <button className="icon-button text-button" onClick={() => loadSkills(true)} disabled={busy} title={tr("actions.sync")}>
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            {tr("actions.sync")}
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="control-rail">
          <div className="metric-grid">
            <Metric label={tr("metrics.total")} value={metrics.total} icon={<Box size={18} />} />
            <Metric label={tr("metrics.custom")} value={metrics.custom} icon={<Edit3 size={18} />} />
            <Metric label={tr("metrics.protected")} value={metrics.protectedCount} icon={<Shield size={18} />} />
            <Metric label={tr("metrics.stale")} value={metrics.stale} icon={<Clock3 size={18} />} />
            <Metric label={tr("metrics.optimize")} value={metrics.optimize} icon={<Sparkles size={18} />} />
            <Metric label={tr("metrics.missing")} value={metrics.missing} icon={<CircleAlert size={18} />} />
          </div>

          <div className="filter-block">
            <label className="field-label" htmlFor="search">
              <Search size={14} />
              {tr("filters.search")}
            </label>
            <input
              id="search"
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("filters.searchPlaceholder")}
            />
          </div>

          <FilterGroup label={tr("filters.source")} icon={<Folder size={14} />}>
            {sourceOptions.map((option) => (
              <button
                key={option}
                className={sourceFilter === option ? "seg active" : "seg"}
                onClick={() => setSourceFilter(option)}
              >
                {sourceLabel(option, language)}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label={tr("filters.lifecycle")} icon={<Filter size={14} />}>
            {lifecycleOptions.map((option) => (
              <button
                key={option}
                className={lifecycleFilter === option ? "seg active" : "seg"}
                onClick={() => setLifecycleFilter(option)}
              >
                {lifecycleOptionLabel(option, language)}
              </button>
            ))}
          </FilterGroup>

          <div className="filter-block">
            <div className="field-label">
              <Clock3 size={14} />
              {tr("filters.staleThreshold")}
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
            <div className="sync-model">
              <RefreshCw size={15} />
              <span>{tr("sync.help")}</span>
            </div>
            <div className="panel-title">{tr("filters.scanRoots")}</div>
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
              <div className="board-kicker">{tr("board.visible", { count: filteredSkills.length })}</div>
              <h2>{tr("board.inventory")}</h2>
            </div>
            <div className="policy-strip">
              <Shield size={15} />
              {tr("board.policy")}
            </div>
          </div>

          <div className="skill-grid">
            {filteredSkills.map((skill) => (
              <button
                key={skill.id}
                className={selected?.id === skill.id ? "skill-card selected" : "skill-card"}
                onClick={() => setSelectedId(skill.id)}
              >
                <SkillArtwork skill={skill} />
                <div className="skill-card-body">
                  <div className="skill-card-top">
                    <strong>{skill.name}</strong>
                    {skill.favorite ? <Star size={15} fill="currentColor" /> : null}
                  </div>
                  <p>{skill.description || tr("skill.noDescription")}</p>
                  <div className="tags">
                    <span>{sourceLabel(skill.sourceKind, language)}</span>
                    <span>{lifecycleOptionLabel(skill.lifecycle, language)}</span>
                    {isStale(skill, staleDays) ? <span className="warn">{tr("lifecycle.stale")}</span> : null}
                    {skill.descriptionMissing ? <span className="warn">{tr("skill.missingDescription")}</span> : null}
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
                <SkillArtwork skill={selected} size="large" />
                <div>
                  <div className="eyebrow">{selected.rootLabel}</div>
                  <h2>{selected.name}</h2>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="icon-button action-button"
                  title={tr("actions.favorite")}
                  onClick={() => patchState(selected.id, { favorite: !selected.favorite })}
                >
                  <Heart size={16} fill={selected.favorite ? "currentColor" : "none"} />
                  <span>{tr("actions.favorite")}</span>
                </button>
                <button
                  className="icon-button action-button"
                  title={tr("actions.markUsed")}
                  onClick={() => patchState(selected.id, { lastUsedAt: new Date().toISOString(), lifecycle: "active" })}
                >
                  <Check size={16} />
                  <span>{tr("actions.markUsed")}</span>
                </button>
                <button
                  className="icon-button action-button danger"
                  title={tr("actions.quarantine")}
                  onClick={quarantineSelected}
                >
                  <Trash2 size={16} />
                  <span>{tr("actions.quarantine")}</span>
                </button>
              </div>
              <div className="inline-help actions-help">{tr("detail.actionsHelp")}</div>

              <div className="lifecycle-control">
                {(["active", "optimize", "archive"] as Lifecycle[]).map((lifecycle) => (
                  <button
                    key={lifecycle}
                    className={selected.lifecycle === lifecycle ? "seg active" : "seg"}
                    onClick={() => patchState(selected.id, { lifecycle })}
                  >
                    {lifecycle === "archive" ? <Archive size={14} /> : null}
                    {lifecycleOptionLabel(lifecycle, language)}
                  </button>
                ))}
              </div>
              <div className="inline-help">{tr("detail.lifecycleHelp")}</div>

              <div className="meta-list">
                <Meta label={tr("detail.path")} value={selected.skillFile} />
                <Meta label={tr("detail.modified")} value={formatDate(selected.modifiedAt, language)} />
                <Meta label={tr("detail.lastUsed")} value={selected.lastUsedAt ? formatDate(selected.lastUsedAt, language) : tr("detail.lastUsedUnset")} />
                <Meta label={tr("detail.size")} value={`${Math.round(selected.sizeBytes / 10.24) / 100} KB`} />
              </div>

              <label className="notes-label" htmlFor="notes">
                {tr("detail.notes")}
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
                placeholder={tr("detail.notesPlaceholder")}
              />

              <div className="editor-header">
                <div>
                  <div className="panel-title">{tr("editor.title")}</div>
                  <span>{selected.riskLevel === "protected" ? tr("editor.protected") : tr("editor.editable")}</span>
                </div>
                <div className="editor-actions">
                  {editing ? (
                    <>
                      <button className="icon-button" title={tr("actions.cancel")} onClick={() => { setEditing(false); setDraftContent(content); }}>
                        <X size={16} />
                      </button>
                      <button className="icon-button accent" title={tr("actions.save")} onClick={saveContent} disabled={busy}>
                        <Save size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-button action-button"
                      title={tr("actions.edit")}
                      onClick={startEditingSelected}
                    >
                      <Edit3 size={16} />
                      <span>{tr("actions.edit")}</span>
                    </button>
                  )}
                </div>
              </div>

              {editing ? (
                <textarea className="skill-editor" value={draftContent} onChange={(event) => setDraftContent(event.target.value)} />
              ) : (
                <pre className="skill-preview">
                  <code>{previewContent(content || selected.bodyPreview, language)}</code>
                </pre>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Eye size={24} />
              <p>{tr("empty.noSkill")}</p>
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

const visualIcons: Record<SkillVisualIcon, typeof Sparkles> = {
  bot: Bot,
  blocks: Blocks,
  globe: Globe2,
  braces: Braces,
  database: Database,
  brush: Brush,
  file: FileText,
  media: MonitorPlay,
  shield: Shield,
  check: Check,
  workflow: Workflow,
  mail: Mail,
  terminal: TerminalSquare,
  spark: Sparkles
};

function SkillArtwork({ skill, size = "normal" }: { skill: SkillView; size?: "normal" | "large" }) {
  const visual = getSkillVisual(skill);
  const Icon = visualIcons[visual.icon];
  return (
    <div
      className={`skill-art ${size} ${skill.sourceKind} category-${visual.category} variant-${visual.variant}`}
      aria-hidden="true"
      style={
        {
          "--art-hue": visual.hue,
          "--art-angle": `${visual.angle}deg`,
          "--art-scale": visual.scale,
          "--art-density": `${visual.density}px`,
          "--art-offset": `${visual.offset}px`
        } as React.CSSProperties
      }
    >
      <div className="art-backplate" />
      <div className="art-frame" />
      <div className="art-motif">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="art-core">
        <Icon size={size === "large" ? 30 : 24} strokeWidth={1.75} />
      </div>
    </div>
  );
}

function sourceLabel(source: SourceKind | "all", language: Language): string {
  if (source === "all") {
    return t(language, "options.all");
  }
  if (source === "custom") {
    return t(language, "options.custom");
  }
  if (source === "system") {
    return t(language, "options.system");
  }
  if (source === "plugin") {
    return t(language, "options.plugin");
  }
  return source;
}

function lifecycleOptionLabel(lifecycle: Lifecycle | "all" | "stale", language: Language): string {
  if (lifecycle === "all") {
    return t(language, "options.all");
  }
  if (lifecycle === "stale") {
    return t(language, "lifecycle.stale");
  }
  return t(language, `lifecycle.${lifecycle}`);
}

function getInitialLanguage(): Language {
  const saved = globalThis.localStorage?.getItem("skill-foundry-language");
  return saved === "zh" || saved === "en" ? saved : getDefaultLanguage();
}

function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", { timeStyle: "medium" }).format(new Date(value));
}

function previewContent(value: string, language: Language): string {
  if (value.length <= 6000) {
    return value;
  }
  return `${value.slice(0, 6000)}\n\n${t(language, "editor.truncated")}`;
}
