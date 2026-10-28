import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  Command,
  LayoutDashboard,
  Send,
  Users,
  FileText,
  Workflow,
  Globe,
  KeyRound,
  Inbox,
  Settings,
  BookOpen,
  Github,
  ExternalLink,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  X,
  Copy,
  Cloud,
  ShieldCheck,
  LogOut,
  Menu,
  Upload,
  Code2,
  Filter,
  MoreHorizontal,
  AlertCircle,
  Loader2,
  Zap,
  MousePointer2,
  Lock,
  Download,
  RefreshCw,
  Eye,
  Pause,
  Trash2,
} from "lucide-react";

type Row = Record<string, any>;
type Page =
  | "overview"
  | "emails"
  | "campaigns"
  | "contacts"
  | "templates"
  | "automations"
  | "inbound"
  | "domains"
  | "developers"
  | "settings"
  | "docs";
const navigation: {
  label: string;
  items: { id: Page; label: string; icon: typeof Mail }[];
}[] = [
  {
    label: "WORKSPACE",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "emails", label: "Email activity", icon: Mail },
      { id: "campaigns", label: "Campaigns", icon: Send },
      { id: "contacts", label: "Audience", icon: Users },
      { id: "templates", label: "Templates", icon: FileText },
      { id: "automations", label: "Automations", icon: Workflow },
      { id: "inbound", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      { id: "domains", label: "Domains", icon: Globe },
      { id: "developers", label: "API keys", icon: KeyRound },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];
const titles: Record<Page, string> = {
  overview: "Overview",
  emails: "Email activity",
  campaigns: "Campaigns",
  contacts: "Audience",
  templates: "Templates",
  automations: "Automations",
  inbound: "Inbox",
  domains: "Sending domains",
  developers: "API keys",
  settings: "Workspace settings",
  docs: "Documentation",
};
const descriptions: Record<Page, string> = {
  overview: "A little clarity for everything you send.",
  emails: "Every message has a story. Follow it here.",
  campaigns: "Good stories deserve a place in the inbox.",
  contacts: "Real people. Meaningful connections.",
  templates: "Start with a blank page. Make it yours.",
  automations: "The right message, right on time.",
  inbound: "The conversation goes both ways.",
  domains: "A trusted home for your emails.",
  developers: "Connect your application. Keep control.",
  settings: "A workspace that feels like your own.",
  docs: "Everything you need to start sending.",
};
const num = (n: unknown) => Number(n ?? 0).toLocaleString("en-US");
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
import { previewDoc } from "./preview";
const blankHtml =
  '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;padding:40px;background:#faf8f1;color:#203b30"><p style="font:12px sans-serif;letter-spacing:2px">A NOTE FROM GENESEND</p><h1 style="font-size:40px">Good things<br>start here.</h1><p>Hello {{name}},</p><p>We’re glad you’re here. Make yourself at home.</p><p style="margin-top:40px">The team</p></div>';
async function request(path: string, options?: RequestInit) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const json = (await r.json()) as Row;
  if (!r.ok)
    throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <a
      className={`brand ${small ? "small" : ""}`}
      href="#overview"
      aria-label="GeneSend home"
    >
      <span className="brand-icon">
        <Send size={small ? 18 : 22} strokeWidth={1.8} />
      </span>
      {!small && (
        <>
          Gene<span>Send</span>
          <i>✳</i>
        </>
      )}
    </a>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {status === "ready"
        ? "Ready to send"
        : status === "accepted"
          ? "Accepted"
          : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
function Empty({
  icon: Icon = Mail,
  title,
  description,
  action,
  onAction,
}: {
  icon?: typeof Mail;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={29} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={onAction}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const first = ref.current?.querySelector<HTMLElement>(
      "input,button,textarea,select",
    );
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const a = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,textarea,select,a[href]",
          ) ?? [],
        ).filter((x) => !x.hasAttribute("disabled"));
        if (e.shiftKey && document.activeElement === a[0]) {
          e.preventDefault();
          a.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
          e.preventDefault();
          a[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function App() {
  const initial = location.hash.slice(1) as Page;
  const [page, setPage] = useState<Page>(
    Object.hasOwn(titles, initial) ? initial : "overview",
  );
  const [auth, setAuth] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loadedContext, setLoadedContext] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mobile, setMobile] = useState(false);
  const [revision, setRevision] = useState(0);
  const [config, setConfig] = useState<Row>({});
  const closeModal = useCallback(() => {
    setModal("");
    setSelected(null);
  }, []);
  const navigate = (p: Page) => {
    location.hash = p;
    setMobile(false);
  };
  useEffect(() => {
    const h = () => {
      const p = location.hash.slice(1) as Page;
      setPage(Object.hasOwn(titles, p) ? p : "overview");
      setSearch("");
      setStatusFilter("all");
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    request("/api/session")
      .then((x) => setAuth(x.authenticated))
      .catch(() => {})
      .finally(() => setSessionReady(true));
  }, []);
  useEffect(() => {
    if (auth)
      request("/api/config")
        .then((x) => setConfig(x.data))
        .catch(() => setConfig({}));
    else setConfig({});
  }, [auth, revision]);
  useEffect(() => {
    if (!sessionReady) return;
    const context = `${auth}:${page}`;
    setError("");
    if (["docs", "settings"].includes(page)) {
      setData(null);
      setLoadedContext(context);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    const resource = page === "developers" ? "keys" : page;
    request(auth ? `/api/${resource}` : `/api/demo/${resource}`)
      .then((x) => {
        if (!cancelled) {
          setData(x.data);
          setLoadedContext(context);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoadedContext(context);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, auth, sessionReady, revision]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const refresh = () => setRevision((r) => r + 1);
  const changed = (message: string) => {
    closeModal();
    refresh();
    setToast(message);
  };
  const action = (name: string, item: Row | null = null) => {
    if (!auth) {
      setModal("login");
      return;
    }
    setSelected(item);
    setModal(name);
  };
  const rows: Array<Row> = Array.isArray(data) ? data : [];
  const filtered = rows.filter(
    (x) =>
      JSON.stringify(x).toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === "all" || x.status === statusFilter),
  );
  const showPreview = (item: Row) => {
    setSelected(item);
    setModal("preview");
  };
  const currentItems = navigation.flatMap((g) => g.items);
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Logo />
        <button
          className="workspace-switch"
          onClick={() => setModal(auth ? "workspace" : "login")}
        >
          <span className="workspace-avatar">{auth ? "G" : "A"}</span>
          <span>
            <strong>{auth ? "Gene’s workspace" : "Acme workspace"}</strong>
            <small>{auth ? "Private workspace" : "Example workspace"}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav>
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <a
                  href={`#${item.id}`}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setMobile(false)}
                >
                  <item.icon size={18} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {item.id === "inbound" && (
                    <span className="nav-new">NEW</span>
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="open-source-card">
            <span className="seedling">↗</span>
            <strong>A little more open.</strong>
            <p>
              Your emails. Your infrastructure.
              <br />
              Open source, all the way.
            </p>
            <a
              href="https://github.com/Digidai/genedai-send"
              target="_blank"
              rel="noreferrer"
            >
              Star us on GitHub <ArrowUpRight size={14} />
            </a>
          </div>
          <a
            href="#docs"
            className={`nav-item ${page === "docs" ? "active" : ""}`}
          >
            <BookOpen size={18} />
            Documentation
            <ArrowUpRight size={13} />
          </a>
          <button
            className="profile"
            onClick={() => setModal(auth ? "workspace" : "login")}
          >
            <span className="profile-avatar">{auth ? "G" : "D"}</span>
            <span>
              <strong>{auth ? "Gene Dai" : "Explore GeneSend"}</strong>
              <small>{auth ? "Workspace owner" : "Open your workspace"}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-shade" onClick={() => setMobile(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span className="crumb-icon">
              <LayoutDashboard size={15} />
            </span>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{titles[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="edge-status">
              <span />
              Running on Cloudflare
            </span>
            <button
              className="search-trigger"
              onClick={() => setModal("search")}
              aria-label="Search workspace"
            >
              <Search size={16} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <a
              className="icon-button github-top"
              aria-label="GitHub repository"
              href="https://github.com/Digidai/genedai-send"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={18} />
            </a>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "overview"
                  ? "YOUR EMAILS, AT A GLANCE"
                  : "YOUR EMAIL WORKSPACE"}
              </div>
              <h1>
                {page === "overview" ? (
                  <>
                    Make yourself <span>at home.</span>
                  </>
                ) : (
                  titles[page]
                )}
              </h1>
              <p>{descriptions[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "overview" ? (
                <>
                  <button className="button" onClick={() => navigate("docs")}>
                    <Code2 size={16} />
                    API docs
                    <ArrowUpRight size={14} />
                  </button>
                  <button
                    className="button primary"
                    onClick={() => action("send")}
                  >
                    <Plus size={17} />
                    Send an email
                  </button>
                </>
              ) : page === "contacts" ? (
                <>
                  <button className="button" onClick={() => action("import")}>
                    <Upload size={16} />
                    Import CSV
                  </button>
                  <button
                    className="button primary"
                    onClick={() => action("contact")}
                  >
                    <Plus size={17} />
                    Add contact
                  </button>
                </>
              ) : page === "templates" ? (
                <button
                  className="button primary"
                  onClick={() => action("template")}
                >
                  <Plus size={17} />
                  Create template
                </button>
              ) : page === "campaigns" ? (
                <button
                  className="button primary"
                  onClick={() => action("campaign")}
                >
                  <Plus size={17} />
                  Create campaign
                </button>
              ) : page === "automations" ? (
                <button
                  className="button primary"
                  onClick={() => action("automation")}
                >
                  <Plus size={17} />
                  Create automation
                </button>
              ) : page === "domains" ? (
                <button
                  className="button primary"
                  onClick={() => action("domain")}
                >
                  <Plus size={17} />
                  Add domain
                </button>
              ) : page === "developers" ? (
                <button
                  className="button primary"
                  onClick={() => action("key")}
                >
                  <Plus size={17} />
                  Create API key
                </button>
              ) : page === "emails" ? (
                <button
                  className="button primary"
                  onClick={() => action("send")}
                >
                  <Plus size={17} />
                  Send an email
                </button>
              ) : null}
            </div>
          </div>
          {!auth && (
            <div className="demo-banner">
              <span className="demo-badge">
                <Eye size={13} />
                LIVE PREVIEW
              </span>
              <p>
                You’re looking at sample data. Your own workspace starts with a
                clean slate.
              </p>
              <button onClick={() => setModal("login")}>
                Open workspace
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {error && loadedContext === `${auth}:${page}` ? (
            <div className="error-state">
              <AlertCircle />
              <h3>We couldn’t load this page.</h3>
              <p>{error}</p>
              <button className="button" onClick={refresh}>
                <RefreshCw size={16} />
                Try again
              </button>
            </div>
          ) : loading || loadedContext !== `${auth}:${page}` ? (
            <div className="loading">
              <Loader2 className="spin" size={26} />
              <span>Getting your workspace ready…</span>
            </div>
          ) : (
            <>
              {page === "overview" && data && (
                <Overview
                  data={data}
                  auth={auth}
                  onSend={() => action("send")}
                  onNavigate={navigate}
                />
              )}
              {page === "emails" && (
                <>
                  <div className="panel">
                    <TableToolbar
                      search={search}
                      setSearch={setSearch}
                      placeholder="Search email or subject…"
                      right={
                        <select
                          aria-label="Filter email status"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <option value="all">All statuses</option>
                          {[
                            "queued",
                            "accepted",
                            "delivered",
                            "failed",
                            "uncertain",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      }
                    />
                    <EmailTable
                      rows={filtered}
                      onSelect={(item) => {
                        if (auth) {
                          setSelected(item);
                          setModal("email-detail");
                        } else
                          setToast(
                            "This is a sample message. Sign in to inspect your own delivery events.",
                          );
                      }}
                    />
                    {!filtered.length && (
                      <Empty
                        title="Your first message starts here"
                        description="Send through the API or compose a transactional email."
                        action="Send an email"
                        onAction={() => action("send")}
                      />
                    )}
                  </div>
                  <div className="footnote">
                    <ShieldCheck size={15} />
                    Accepted means the provider accepted the message. Delivery
                    is only shown when confirmed.
                  </div>
                </>
              )}
              {page === "contacts" && (
                <>
                  <div className="audience-summary">
                    <div>
                      <span className="summary-icon">
                        <Users size={22} />
                      </span>
                      <div>
                        <strong>{num(rows.length)}</strong>
                        <span>Contacts in this view</span>
                      </div>
                    </div>
                    <div>
                      <i className="dot green" />
                      <strong>
                        {rows.filter((x) => x.status === "subscribed").length}
                      </strong>
                      <span>Subscribed</span>
                    </div>
                    <div>
                      <i className="dot gray" />
                      <strong>
                        {rows.filter((x) => x.status === "unsubscribed").length}
                      </strong>
                      <span>Unsubscribed</span>
                    </div>
                    <div className="summary-note">
                      <ShieldCheck size={17} />
                      Permission is a good beginning.
                    </div>
                  </div>
                  <div className="panel">
                    <TableToolbar
                      search={search}
                      setSearch={setSearch}
                      placeholder="Find someone in your audience…"
                      right={
                        <select
                          value={statusFilter}
                          aria-label="Filter contact status"
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <option value="all">All contacts</option>
                          <option value="subscribed">Subscribed</option>
                          <option value="pending">Pending consent</option>
                          <option value="unsubscribed">Unsubscribed</option>
                          <option value="suppressed">Suppressed</option>
                        </select>
                      }
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Contact</th>
                            <th>Status</th>
                            <th>Tags</th>
                            <th>Added</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((r, i) => (
                            <tr key={r.id}>
                              <td>
                                <div className="person">
                                  <span className={`avatar tone-${i % 4}`}>
                                    {(r.name || r.email)
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>
                                      {r.name || "Unnamed contact"}
                                    </strong>
                                    <small>{r.email}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <Badge status={r.status} />
                              </td>
                              <td>
                                <div className="tags">
                                  {r.tags.map((t: string) => (
                                    <span key={t}>{t}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="muted">{fmt(r.created_at)}</td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Manage ${r.email}`}
                                  onClick={() => action("manage-contact", r)}
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filtered.length && (
                      <Empty
                        icon={Users}
                        title="Make your first connection"
                        description="Add a contact or import a CSV with email, name, tags, and opt_in columns."
                        action="Add contact"
                        onAction={() => action("contact")}
                      />
                    )}
                    <div className="table-footer">
                      {filtered.length} contact
                      {filtered.length !== 1 ? "s" : ""}
                      <span>Up to 1,000 contacts per view</span>
                    </div>
                  </div>
                </>
              )}
              {page === "templates" && (
                <>
                  <div className="section-tools">
                    <div className="tabs">
                      <button
                        className={statusFilter === "all" ? "selected" : ""}
                        onClick={() => setStatusFilter("all")}
                      >
                        All templates <span>{rows.length}</span>
                      </button>
                      <button
                        className={
                          statusFilter === "transactional" ? "selected" : ""
                        }
                        onClick={() => setStatusFilter("transactional")}
                      >
                        Transactional
                      </button>
                      <button
                        className={
                          statusFilter === "marketing" ? "selected" : ""
                        }
                        onClick={() => setStatusFilter("marketing")}
                      >
                        Marketing
                      </button>
                    </div>
                    <div className="inline-search">
                      <Search size={16} />
                      <input
                        aria-label="Search templates"
                        placeholder="Find a template…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="template-grid">
                    {rows
                      .filter(
                        (r) =>
                          (statusFilter === "all" ||
                            r.category === statusFilter) &&
                          r.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((r, i) => (
                        <article className="template-card" key={r.id}>
                          <button
                            className={`template-preview preview-${i % 3}`}
                            onClick={() => showPreview(r)}
                            aria-label={`Preview ${r.name}`}
                          >
                            <div className="mini-mail">
                              <span className="mini-brand">
                                {i % 3 === 0
                                  ? "A LITTLE HELLO"
                                  : i % 3 === 1
                                    ? "THE WEEKLY EDIT"
                                    : "ACCOUNT / SECURITY"}
                              </span>
                              <h3>
                                {i % 3 === 0 ? (
                                  <>
                                    Good things
                                    <br />
                                    start here.
                                  </>
                                ) : i % 3 === 1 ? (
                                  <>
                                    A fresh
                                    <br />
                                    perspective.
                                  </>
                                ) : (
                                  <>
                                    Let’s get you
                                    <br />
                                    back in.
                                  </>
                                )}
                              </h3>
                              <span className="mini-line" />
                              <span className="mini-line short" />
                              <span className="mini-cta" />
                            </div>
                            <span className="preview-label">
                              <Eye size={14} />
                              Preview template
                            </span>
                          </button>
                          <div className="template-info">
                            <div>
                              <h3>{r.name}</h3>
                              <p>
                                {r.category} · Updated {fmt(r.updated_at)}
                              </p>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${r.name}`}
                              onClick={() => action("template", r)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                        </article>
                      ))}
                    <button
                      className="new-template"
                      onClick={() => action("template")}
                    >
                      <span>
                        <Plus size={24} />
                      </span>
                      <strong>A blank canvas</strong>
                      <p>For your next good idea.</p>
                    </button>
                  </div>
                </>
              )}
              {page === "campaigns" && (
                <>
                  <div className="notice">
                    <span className="notice-icon">
                      <Send size={18} />
                    </span>
                    <div>
                      <strong>A place for your next big announcement.</strong>
                      <p>
                        Create, schedule, and send through Resend or SendGrid.
                        Add a verified sender and provider credentials in
                        Settings to get started.
                      </p>
                    </div>
                    <a href="#settings">
                      Configure providers
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                  <div className="panel">
                    <TableToolbar
                      search={search}
                      setSearch={setSearch}
                      placeholder="Search campaigns…"
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Campaign</th>
                            <th>Audience</th>
                            <th>Status</th>
                            <th>Results</th>
                            <th>Created</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <button
                                  className="table-title"
                                  onClick={() =>
                                    auth && r.status === "draft"
                                      ? action("campaign", r)
                                      : showPreview(r)
                                  }
                                >
                                  <span className="table-icon">
                                    <Send size={18} />
                                  </span>
                                  <span>
                                    <strong>{r.name}</strong>
                                    <small>{r.subject}</small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span className="tag">
                                  {r.audience_tag || "All subscribers"}
                                </span>
                              </td>
                              <td>
                                <Badge status={r.status} />
                              </td>
                              <td>
                                <strong>{r.delivered ?? 0}</strong> delivered
                                <small>
                                  {r.opened ?? 0} opened · {r.clicked ?? 0}{" "}
                                  clicked
                                </small>
                              </td>
                              <td className="muted">{fmt(r.created_at)}</td>
                              <td>
                                <div className="campaign-actions">
                                  <button
                                    className="icon-button"
                                    aria-label={`Preview ${r.name}`}
                                    onClick={() => showPreview(r)}
                                  >
                                    <Eye size={17} />
                                  </button>
                                  <button
                                    className="button"
                                    onClick={() =>
                                      action("campaign-control", r)
                                    }
                                  >
                                    {r.status === "draft"
                                      ? "Review & send"
                                      : "Manage"}
                                    <ArrowUpRight size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filtered.length && (
                      <Empty
                        icon={Send}
                        title="Something worth sharing?"
                        description="Create a campaign, choose your audience, and schedule the next good conversation."
                        action="Create campaign"
                        onAction={() => action("campaign")}
                      />
                    )}
                  </div>
                </>
              )}
              {page === "automations" && (
                <>
                  <div className="automation-intro">
                    <div>
                      <span className="label-pill">
                        <Zap size={13} />
                        LESS BUSYWORK, MORE CONNECTION
                      </span>
                      <h2>
                        A thoughtful touch.
                        <br />
                        <em>On autopilot.</em>
                      </h2>
                      <p>
                        Turn a signup, purchase, or product event into a timely
                        transactional email.
                      </p>
                    </div>
                    <div className="workflow-illustration">
                      <div>
                        <Zap size={17} />
                        <span>Event received</span>
                        <i />
                      </div>
                      <span className="connector" />
                      <div>
                        <Clock size={17} />
                        <span>A little breathing room</span>
                      </div>
                      <span className="connector" />
                      <div>
                        <Mail size={17} />
                        <span>The right email</span>
                        <Check size={14} />
                      </div>
                    </div>
                  </div>
                  <div className="cards-list">
                    {filtered.map((r) => (
                      <article className="automation-card" key={r.id}>
                        <span className="automation-icon">
                          <Workflow size={22} />
                        </span>
                        <div>
                          <h3>{r.name}</h3>
                          <p>
                            <code>{r.event_name}</code>
                            <ArrowRight size={12} />
                            {r.delay_minutes
                              ? `${r.delay_minutes} min delay`
                              : "Send immediately"}
                          </p>
                        </div>
                        <Badge status={r.status} />
                        <button
                          className="button"
                          onClick={() => action("automation", r)}
                        >
                          Edit
                          <ArrowUpRight size={14} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!rows.length && (
                    <div className="panel">
                      <Empty
                        icon={Workflow}
                        title="Give the everyday a little flow"
                        description="Create an event-triggered workflow with a template and an optional delay."
                        action="Create automation"
                        onAction={() => action("automation")}
                      />
                    </div>
                  )}
                </>
              )}
              {page === "inbound" && (
                <>
                  <div className="notice">
                    <Inbox size={23} />
                    <div>
                      <strong>Keep the conversation close.</strong>
                      <p>
                        Enable an Email Routing rule in Cloudflare to route a
                        dedicated address to the genesend Worker. Existing mail
                        routing is preserved.
                      </p>
                    </div>
                    <a href="#docs">
                      Setup guide
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                  <div className="panel">
                    {rows.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>From</th>
                              <th>Subject</th>
                              <th>Received</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.id}>
                                <td>{r.from_email}</td>
                                <td>{r.subject}</td>
                                <td>{fmt(r.created_at)}</td>
                                <td>
                                  <button
                                    className="button"
                                    onClick={() => {
                                      setSelected(r);
                                      setModal("inbound-detail");
                                    }}
                                  >
                                    Read
                                    <ArrowUpRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        icon={Inbox}
                        title="A little quiet in here"
                        description="Incoming conversations will appear here once a dedicated address is connected."
                      />
                    )}
                  </div>
                </>
              )}
              {page === "domains" && (
                <>
                  <div className="notice">
                    <ShieldCheck size={24} />
                    <div>
                      <strong>Trust starts with a verified sender.</strong>
                      <p>
                        Cloudflare manages SPF, DKIM, and bounce handling for
                        onboarded domains. Only operator-approved domains can
                        send.
                      </p>
                    </div>
                  </div>
                  <div className="cards-list">
                    {rows.map((r) => (
                      <article className="domain-card" key={r.id}>
                        <span className="domain-icon">
                          <Globe size={25} />
                        </span>
                        <div>
                          <h3>{r.name}</h3>
                          <p>Cloudflare Email Service</p>
                        </div>
                        <Badge status={r.status} />
                        <button
                          className="button"
                          onClick={() => {
                            setSelected(r);
                            setModal("dns");
                          }}
                        >
                          View DNS
                          <ArrowUpRight size={14} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!rows.length && (
                    <div className="panel">
                      <Empty
                        icon={Globe}
                        title="Give your emails a home"
                        description="Add a domain, onboard it to Cloudflare Email Service, and verify your DNS."
                        action="Add domain"
                        onAction={() => action("domain")}
                      />
                    </div>
                  )}
                  <div className="domain-guides">
                    <div>
                      <span>01</span>
                      <h3>Add your domain</h3>
                      <p>Choose the domain you want to send from.</p>
                    </div>
                    <div>
                      <span>02</span>
                      <h3>Authenticate with DNS</h3>
                      <p>Onboard your domain in Cloudflare Email Service.</p>
                    </div>
                    <div>
                      <span>03</span>
                      <h3>Start a conversation</h3>
                      <p>Enable the sender in your Worker configuration.</p>
                    </div>
                  </div>
                </>
              )}
              {page === "developers" && (
                <>
                  <div className="developer-hero">
                    <div>
                      <span className="label-pill">
                        <Code2 size={14} />
                        MADE FOR BUILDERS
                      </span>
                      <h2>
                        Your next email is
                        <br />
                        <em>one request away.</em>
                      </h2>
                      <p>
                        Scoped keys. A familiar API. Infrastructure you own.
                      </p>
                      <button
                        className="button"
                        onClick={() => navigate("docs")}
                      >
                        Read the API docs
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <CodeSnippet />
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <h3>API keys</h3>
                      <span className="muted">
                        Secrets are only shown once.
                      </span>
                    </div>
                    {rows.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Key</th>
                              <th>Permission</th>
                              <th>Last used</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <strong>{r.name}</strong>
                                  {r.revoked_at && (
                                    <span className="tag">Revoked</span>
                                  )}
                                </td>
                                <td>
                                  <code>{r.prefix}••••••••</code>
                                </td>
                                <td>
                                  <span className="tag">{r.scope}</span>
                                </td>
                                <td className="muted">
                                  {r.last_used_at
                                    ? fmt(r.last_used_at)
                                    : "Never"}
                                </td>
                                <td>
                                  {!r.revoked_at && (
                                    <button
                                      className="text-button danger"
                                      onClick={() => action("revoke-key", r)}
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        icon={KeyRound}
                        title="One key. A world of possibilities."
                        description="Create a scoped API key to connect your application securely."
                        action="Create API key"
                        onAction={() => action("key")}
                      />
                    )}
                  </div>
                </>
              )}
              {page === "settings" && (
                <>
                  <ProviderSettings
                    auth={auth}
                    config={config}
                    onLogin={() => setModal("login")}
                    onSaved={() => {
                      refresh();
                      setToast("Provider settings saved.");
                    }}
                  />
                  <SettingsPage
                    auth={auth}
                    config={config}
                    onLogin={() => setModal("login")}
                    onSuppress={() => action("suppression")}
                  />
                </>
              )}
              {page === "docs" && <Docs />}
            </>
          )}
          <footer className="footer">
            <div>
              <span className="footer-dot" />
              Made for good emails.
            </div>
            <span>
              Open source. Built on Cloudflare.
              <Cloud size={15} />
            </span>
            <a
              href="https://github.com/Digidai/genedai-send"
              target="_blank"
              rel="noreferrer"
            >
              GeneSend v0.1
              <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "login" && (
        <Login
          onClose={closeModal}
          onSuccess={() => {
            setAuth(true);
            changed("Welcome to your workspace.");
          }}
        />
      )}
      {modal === "search" && (
        <Modal title="Find your way" onClose={closeModal}>
          <div className="command-search">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Jump to a page…"
              aria-label="Search pages"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="command-results">
            {[
              ...currentItems,
              { id: "docs" as Page, label: "Documentation", icon: BookOpen },
            ]
              .filter((x) =>
                x.label.toLowerCase().includes(search.toLowerCase()),
              )
              .map((x) => (
                <button
                  key={x.id}
                  onClick={() => {
                    navigate(x.id);
                    closeModal();
                    setSearch("");
                  }}
                >
                  <x.icon size={18} />
                  {x.label}
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {modal === "workspace" && (
        <Modal
          title="Your private workspace"
          description="Signed in as the workspace owner."
          onClose={closeModal}
        >
          <div className="workspace-details">
            <ShieldCheck size={36} />
            <p>
              Your contacts, message content, API keys, and activity are
              private. Public visitors only see invented sample data.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button" onClick={closeModal}>
              Back to workspace
            </button>
            <button
              className="button danger"
              onClick={async () => {
                await request("/api/logout", { method: "POST" });
                setAuth(false);
                changed("Signed out. Your workspace is private.");
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </Modal>
      )}
      {[
        "contact",
        "import",
        "template",
        "campaign",
        "automation",
        "domain",
        "key",
        "send",
        "suppression",
        "manage-contact",
        "revoke-key",
      ].includes(modal) && (
        <Editor
          kind={modal}
          item={selected}
          config={config}
          onClose={closeModal}
          onSuccess={changed}
        />
      )}
      {modal === "preview" && selected && (
        <Modal
          title={selected.name ?? "Email preview"}
          description={selected.subject}
          onClose={closeModal}
          wide
        >
          <iframe
            title="Email preview"
            sandbox=""
            className="email-preview"
            srcDoc={previewDoc(selected.html)}
          />
          <div className="modal-actions">
            <button className="button" onClick={closeModal}>
              Close preview
            </button>
            {auth && (
              <button
                className="button primary"
                onClick={() => {
                  setModal(page === "campaigns" ? "campaign" : "template");
                }}
              >
                Edit template
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === "campaign-control" && selected && (
        <CampaignControl
          item={selected}
          onClose={closeModal}
          onSuccess={changed}
        />
      )}
      {modal === "dns" && selected && (
        <Dns item={selected} auth={auth} onClose={closeModal} />
      )}
      {["email-detail", "inbound-detail"].includes(modal) && selected && (
        <MessageDetail
          item={selected}
          inbound={modal === "inbound-detail"}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
function Overview({
  data,
  auth,
  onSend,
  onNavigate,
}: {
  data: Row;
  auth: boolean;
  onSend: () => void;
  onNavigate: (p: Page) => void;
}) {
  const t = data.totals;
  return (
    <>
      <div className="welcome-strip">
        <div className="welcome-copy">
          <span className="label-pill">
            <span className="dot green" />A GOOD DAY TO CONNECT
          </span>
          <h2>
            Big ideas.
            <br />
            <em>Thoughtful emails.</em>
          </h2>
          <p>
            From a first hello to the next big thing.
            <br />
            Your entire email world, in one place.
          </p>
          <button onClick={onSend}>
            Let’s send something
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="mail-art" aria-hidden="true">
          <svg className="flight-trail" viewBox="0 0 470 230">
            <path
              d="M3 190C75 230 136 177 144 133S121 76 108 97s19 57 77 17S277 25 383 45"
              fill="none"
              stroke="#b3c7b9"
              strokeWidth="1.5"
              strokeDasharray="4 6"
            />
            <circle cx="27" cy="202" r="4" fill="#d6e0d4" />
            <path d="m423 21-45 20 19 9 8 17 18-46Z" fill="#278063" />
            <path d="m397 50 18-19" stroke="#f6faf6" strokeWidth="1.2" />
          </svg>
          <div className="envelope-back" />
          <div className="letter">
            <span className="letter-logo">g.</span>
            <span className="letter-line" />
            <span className="letter-line short" />
            <div className="letter-stamp">
              <Check size={17} />
            </div>
            <span className="letter-caption">
              A little hello goes a long way.
            </span>
          </div>
          <div className="envelope">
            <div className="envelope-flap" />
            <span>sent with a little care.</span>
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✧</span>
          <div className="floating-note">
            <span>
              <Check size={13} />
            </span>
            Good things, delivered.
          </div>
        </div>
        <span className="strip-corner">✳</span>
      </div>
      <div className="stats-grid">
        <Stat
          label="Emails created"
          value={t.total}
          note={
            auth ? "All time in your workspace" : "Sample activity, all time"
          }
          icon={Mail}
          color="green"
        />
        <Stat
          label="Provider accepted"
          value={t.accepted + t.delivered}
          note="Acceptance is not inbox delivery"
          icon={CheckCircle2}
          color="blue"
        />
        <Stat
          label="Audience"
          value={t.contacts}
          note="People in your workspace"
          icon={Users}
          color="amber"
        />
        <Stat
          label="Delivery issues"
          value={t.failed + (t.uncertain ?? 0)}
          note="Failed or awaiting investigation"
          icon={ShieldCheck}
          color="rose"
        />
      </div>
      <div className="overview-middle">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Email activity</h3>
              <p>A pulse on your outgoing conversations.</p>
            </div>
            <span className="range-label">
              <Clock size={13} />
              {auth ? "Last 30 days" : "Sample week"}
            </span>
          </div>
          <ActivityChart series={data.series} />
          <div className="chart-legend">
            <span>
              <i />
              Emails created
            </span>
            <span>
              {auth ? "Live workspace data" : "Illustrative sample data"}
            </span>
          </div>
        </div>
        <div className="panel getting-started">
          <div className="panel-heading">
            <div>
              <span className="tiny-eyebrow">A LITTLE MOMENTUM</span>
              <h3>Make your first connection.</h3>
            </div>
            <span className="leaf-icon">↗</span>
          </div>
          <p>Three small steps. One good beginning.</p>
          <div className="steps">
            <button onClick={() => onNavigate("domains")}>
              <span>1</span>
              <div>
                <strong>Give your emails a home</strong>
                <small>Connect a sending domain</small>
              </div>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => onNavigate("developers")}>
              <span>2</span>
              <div>
                <strong>Find your key</strong>
                <small>Create your first API key</small>
              </div>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={onSend}>
              <span>3</span>
              <div>
                <strong>Say your first hello</strong>
                <small>Send a transactional email</small>
              </div>
              <ArrowUpRight size={16} />
            </button>
          </div>
          <a href="#docs">
            A little help getting started
            <BookOpen size={14} />
          </a>
        </div>
      </div>
      <div className="panel recent-panel">
        <div className="panel-heading">
          <div className="title-inline">
            <h3>Recent emails</h3>
            <span className="count-pill">{data.recent.length}</span>
          </div>
          <button className="text-button" onClick={() => onNavigate("emails")}>
            View activity
            <ArrowRight size={15} />
          </button>
        </div>
        {data.recent.length ? (
          <EmailTable rows={data.recent} />
        ) : (
          <Empty
            title="Your first hello is still ahead"
            description="Send your first transactional email to see its progress here."
            action="Send an email"
            onAction={onSend}
          />
        )}
      </div>
      <div className="bottom-note">
        <span>✳</span>
        <p>
          Good infrastructure should feel invisible.{" "}
          <strong>Good emails shouldn’t.</strong>
        </p>
        <a
          href="https://github.com/Digidai/genedai-send"
          target="_blank"
          rel="noreferrer"
        >
          Built in the open
          <ArrowUpRight size={14} />
        </a>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  note,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Mail;
  color: string;
}) {
  return (
    <article className="stat">
      <div>
        <span>{label}</span>
        <i className={`stat-icon ${color}`}>
          <Icon size={17} strokeWidth={1.6} />
        </i>
      </div>
      <strong>{num(value)}</strong>
      <small>{note}</small>
    </article>
  );
}
function ActivityChart({ series }: { series: Row[] }) {
  const values = series.length
    ? series
    : Array.from({ length: 7 }, (_, i) => ({
        day: new Date(Date.now() - (6 - i) * 86400000)
          .toISOString()
          .slice(0, 10),
        count: 0,
      }));
  const max = Math.max(...values.map((x) => x.count), 1);
  const pts = values.map((x, i) => [
    55 + (i * 600) / Math.max(values.length - 1, 1),
    160 - (x.count / max) * 125,
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.join(",")}`).join(" ");
  return (
    <div className="chart">
      <svg
        viewBox="0 0 690 205"
        role="img"
        aria-label={`Email activity: ${values.map((x) => `${x.day}: ${x.count}`).join(", ")}`}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#278366" stopOpacity=".16" />
            <stop offset="100%" stopColor="#278366" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((n) => (
          <g key={n}>
            <line
              x1="55"
              x2="660"
              y1={35 + n * 42}
              y2={35 + n * 42}
              stroke="#edf0ed"
              strokeDasharray="3 5"
            />
            <text x="8" y={39 + n * 42} fill="#98a29b" fontSize="10">
              {num(Math.round(max * (1 - n / 3)))}
            </text>
          </g>
        ))}
        <path d={`${line} L655,164 L55,164 Z`} fill="url(#chartFill)" />
        <path
          d={line}
          fill="none"
          stroke="#228163"
          strokeWidth="2.3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p[0]}
              cy={p[1]}
              r="3"
              fill="#fff"
              stroke="#228163"
              strokeWidth="2"
            >
              <title>
                {values[i].day}: {values[i].count}
              </title>
            </circle>
            {(values.length < 10 || i % Math.ceil(values.length / 7) === 0) && (
              <text
                x={p[0]}
                y="192"
                textAnchor="middle"
                fill="#8e9a93"
                fontSize="10"
              >
                {values[i].day.length > 4
                  ? values[i].day.slice(5)
                  : values[i].day}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
function TableToolbar({
  search,
  setSearch,
  placeholder,
  right,
}: {
  search: string;
  setSearch: (s: string) => void;
  placeholder: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="table-toolbar">
      <div className="inline-search">
        <Search size={16} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {right}
    </div>
  );
}
function EmailTable({
  rows,
  onSelect,
}: {
  rows: Row[];
  onSelect?: (r: Row) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="email-table">
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Type</th>
            <th>Created</th>
            {onSelect && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="email-recipient">
                  <span className="email-avatar">
                    <Mail size={14} />
                  </span>
                  {r.to_email}
                </span>
              </td>
              <td className="subject-cell">{r.subject}</td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <span className="type-label">{r.kind}</span>
              </td>
              <td className="muted">{fmt(r.created_at)}</td>
              {onSelect && (
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Inspect ${r.subject}`}
                    onClick={() => onSelect(r)}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CodeSnippet() {
  return (
    <div className="code-block">
      <div>
        <span />
        <span />
        <span />
        <small>your-first-hello.sh</small>
      </div>
      <pre>
        <span className="code-comment"># A little hello, in a few lines.</span>
        {"\n"}
        <span className="code-blue">curl</span>
        {" https://send.genedai.me/v1/emails \\\n  -H "}
        <span className="code-green">
          {'"Authorization: Bearer $GENESEND_API_KEY"'}
        </span>
        {" \\\n  -H "}
        <span className="code-green">{'"Content-Type: application/json"'}</span>
        {" \\\n  -H "}
        <span className="code-green">{'"Idempotency-Key: welcome-001"'}</span>
        {
          ' \\\n  -d \'{\n    "from": "hello@your-domain.com",\n    "to": "friend@example.com",\n    "subject": "Good things start here",\n    "html": "<h1>Hello, world.</h1>"\n  }\''
        }
      </pre>
    </div>
  );
}
function Login({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  return (
    <Modal
      title="A good place to come back to."
      description="Open your private GeneSend workspace."
      onClose={onClose}
    >
      <div className="login-art">
        <Logo small />
        <span>Your emails. Your space.</span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await request("/api/login", {
              method: "POST",
              body: JSON.stringify({ key }),
            });
            onSuccess();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Workspace access key"
          hint="For self-hosted installations, your operator provides this key. It is never included in the public repository."
        >
          <input
            autoComplete="current-password"
            type="password"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="gs_admin_…"
          />
        </Field>
        {err && (
          <div className="form-error" role="alert">
            {err}
          </div>
        )}
        <button className="button primary full-width" disabled={busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <Lock size={16} />}
          Open workspace
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="modal-footnote">
        Self-hosting?{" "}
        <a
          href="https://github.com/Digidai/genedai-send#self-host"
          target="_blank"
          rel="noreferrer"
        >
          Follow the setup guide
          <ArrowUpRight size={12} />
        </a>
      </p>
    </Modal>
  );
}
function Editor({
  kind,
  item,
  config,
  onClose,
  onSuccess,
}: {
  kind: string;
  item: Row | null;
  config: Row;
  onClose: () => void;
  onSuccess: (s: string) => void;
}) {
  const [form, setForm] = useState<Row>({
    rate_per_minute: 60,
    ...item,
    from_email:
      item?.from_email ??
      `hello@${config.sending_domains?.[0] ?? "your-domain.com"}`,
    html: item?.html ?? blankHtml,
    category: item?.category ?? "transactional",
    scope: "send",
    delay_minutes: item?.delay_minutes ?? 0,
    status: item?.status ?? "draft",
  });
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [templates, setTemplates] = useState<Row[]>([]),
    [createdKey, setCreatedKey] = useState("");
  const [csv, setCsv] = useState("");
  const [importResult, setImportResult] = useState<Row | null>(null);
  useEffect(() => {
    if (kind === "automation")
      request("/api/templates")
        .then((x) =>
          setTemplates(
            x.data.filter((t: Row) => t.category === "transactional"),
          ),
        )
        .catch((e) => setErr(e.message));
  }, [kind]);
  const update = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const input = (
    key: string,
    placeholder = "",
    type = "text",
    required = true,
  ) => (
    <input
      type={type}
      required={required}
      value={form[key] ?? ""}
      placeholder={placeholder}
      onChange={(e) => update(key, e.target.value)}
    />
  );
  const labels: Record<string, string> = {
    contact: "A new connection",
    import: "Bring your audience along",
    template: item ? "Edit your template" : "A blank canvas",
    campaign: item ? "Edit campaign" : "Start something worth sharing",
    automation: item ? "Edit automation" : "A thoughtful new workflow",
    domain: "A home for your emails",
    key: "Create an API key",
    send: "Say your first hello",
    suppression: "Protect your sending reputation",
    "manage-contact": "Contact preferences",
    "revoke-key": "Revoke this API key?",
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      let path = "",
        payload: Row = { ...form };
      let method = "POST";
      if (kind === "contact") {
        path = "/api/contacts";
        payload = {
          email: form.email,
          name: form.name,
          tags: (form.tags_text ?? "")
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean),
          opt_in: form.opt_in === true,
        };
      }
      if (kind === "import") {
        path = "/api/contacts/import";
        payload = { csv };
      }
      if (kind === "template") path = "/api/templates";
      if (kind === "campaign") path = "/api/campaigns";
      if (kind === "automation") {
        path = "/api/automations";
        payload.delay_minutes = Number(form.delay_minutes);
      }
      if (kind === "domain") path = "/api/domains";
      if (kind === "key") path = "/api/keys";
      if (kind === "send") {
        path = "/api/emails";
        payload = {
          to: form.to,
          from: form.from_email,
          subject: form.subject,
          html: form.html,
          provider: form.provider || undefined,
          scheduled_at: form.scheduled_at || undefined,
        };
      }
      if (kind === "suppression") {
        path = "/api/suppressions";
        payload = { email: form.email };
      }
      if (kind === "manage-contact") {
        path = `/api/contacts/${item!.id}`;
        method = "PATCH";
        payload = { status: form.contact_status ?? "unsubscribed" };
      }
      if (kind === "revoke-key") {
        path = `/api/keys/${item!.id}`;
        method = "DELETE";
      }
      const result = await request(path, {
        method,
        body: method === "DELETE" ? undefined : JSON.stringify(payload),
      });
      if (kind === "key") {
        setCreatedKey(result.data.key);
        return;
      }
      if (kind === "import") {
        setImportResult(result.data);
        return;
      }
      onSuccess(
        kind === "send"
          ? "Your email is queued. Follow its progress in Email activity."
          : kind === "revoke-key"
            ? "API key revoked."
            : kind === "manage-contact"
              ? "Contact preference updated."
              : "Saved to your workspace.",
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={labels[kind] ?? "Edit"}
      description={
        kind === "send"
          ? "Send a transactional email through your verified Cloudflare domain."
          : kind === "campaign"
            ? "Draft your message, then review the audience and schedule delivery through Resend or SendGrid."
            : undefined
      }
      onClose={onClose}
      wide={["template", "campaign", "send"].includes(kind)}
    >
      {createdKey ? (
        <div className="key-created">
          <CheckCircle2 size={36} />
          <h3>Keep this key somewhere safe.</h3>
          <p>This is the only time we’ll show the full secret.</p>
          <code>{createdKey}</code>
          <button
            className="button primary"
            onClick={async () => {
              await navigator.clipboard.writeText(createdKey);
              onSuccess("API key copied. Store it securely.");
            }}
          >
            <Copy size={16} />
            Copy key and close
          </button>
        </div>
      ) : importResult ? (
        <>
          <div className="import-result">
            <CheckCircle2 />
            <h3>{importResult.imported} contacts imported</h3>
            <p>{importResult.errors.length} rows need attention.</p>
            {importResult.errors.map((r: Row) => (
              <p key={r.row}>
                Row {r.row}: {r.error}
              </p>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => onSuccess("Contact import complete.")}
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          {kind === "contact" && (
            <>
              <Field label="Email address">
                {input("email", "friend@example.com", "email")}
              </Field>
              <Field label="Name">
                {input("name", "Alex Morgan", "text", false)}
              </Field>
              <Field label="Tags" hint="Separate tags with commas.">
                {input("tags_text", "Customers, Newsletter", "text", false)}
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.opt_in ?? false}
                  onChange={(e) => update("opt_in", e.target.checked)}
                />
                <span>
                  This person explicitly opted in to marketing emails.
                </span>
              </label>
            </>
          )}
          {kind === "import" && (
            <>
              <p className="muted">
                CSV columns: <code>email,name,tags,opt_in</code>. Use semicolons
                between tags. Set opt_in to true only for people who have given
                permission. Existing opt-outs stay opted out.
              </p>
              <label className="file-upload">
                <Upload size={24} />
                <strong>Choose a CSV file</strong>
                <span>Up to 1,000 rows · 1 MB</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 1000000) {
                        setErr("File must be under 1 MB.");
                        return;
                      }
                      setCsv(await f.text());
                    }
                  }}
                />
              </label>
              <Field label="Or paste your CSV">
                <textarea
                  rows={7}
                  required
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={
                    "email,name,tags,opt_in\nfriend@example.com,Alex,Customers,true"
                  }
                />
              </Field>
            </>
          )}
          {["template", "campaign"].includes(kind) && (
            <Field
              label={kind === "template" ? "Template name" : "Campaign name"}
            >
              {input("name", "Give it a memorable name")}
            </Field>
          )}
          {kind === "send" && (
            <div className="form-grid">
              <Field label="From">
                {input("from_email", "hello@your-domain.com", "email")}
              </Field>
              <Field label="To">
                {input("to", "friend@example.com", "email")}
              </Field>
            </div>
          )}
          {kind === "campaign" && (
            <div className="form-grid">
              <Field label="From">
                {input("from_email", "hello@your-domain.com", "email")}
              </Field>
              <Field
                label="Audience tag"
                hint="Leave blank for all subscribed contacts."
              >
                {input("audience_tag", "Newsletter", "text", false)}
              </Field>
            </div>
          )}
          {["template", "campaign", "send"].includes(kind) && (
            <>
              <Field label="Subject">
                {input("subject", "A little hello goes a long way")}
              </Field>
              {kind === "template" && (
                <Field label="Category">
                  <select
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    <option value="transactional">Transactional</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </Field>
              )}
              <div className="editor-columns">
                <Field
                  label="Email HTML"
                  hint="Use {{name}} and other variables in templates. Variables are escaped."
                >
                  <textarea
                    className="code-input"
                    rows={13}
                    required
                    value={form.html}
                    onChange={(e) => update("html", e.target.value)}
                  />
                </Field>
                <div className="preview-pane">
                  <span>LIVE PREVIEW</span>
                  <iframe
                    title="Live email preview"
                    sandbox=""
                    srcDoc={previewDoc(form.html)}
                  />
                </div>
              </div>
              {kind === "campaign" && (
                <>
                  <Field label="Send rate (emails per minute, 1–100)">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={form.rate_per_minute}
                      onChange={(e) =>
                        update("rate_per_minute", Number(e.target.value))
                      }
                    />
                  </Field>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={!!form.track_opens}
                      onChange={(e) => update("track_opens", e.target.checked)}
                    />
                    <span>
                      Track unique opens (image proxies can inflate this signal)
                    </span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={!!form.track_clicks}
                      onChange={(e) => update("track_clicks", e.target.checked)}
                    />
                    <span>
                      Track unique link clicks (automated scanners may trigger
                      events)
                    </span>
                  </label>
                </>
              )}
              {kind === "send" && (
                <Field label="Provider">
                  <select
                    value={form.provider ?? ""}
                    onChange={(e) => update("provider", e.target.value)}
                  >
                    <option value="">Use workspace default</option>
                    <option value="cloudflare">Cloudflare</option>
                    <option value="resend">Resend</option>
                    <option value="sendgrid">SendGrid</option>
                  </select>
                </Field>
              )}
              {kind === "send" && (
                <Field
                  label="Schedule (optional)"
                  hint="Shown in your local timezone. Leave blank to send now."
                >
                  <input
                    type="datetime-local"
                    value={form.schedule_local ?? ""}
                    onChange={(e) => {
                      update("schedule_local", e.target.value);
                      update(
                        "scheduled_at",
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined,
                      );
                    }}
                  />
                </Field>
              )}
            </>
          )}
          {kind === "automation" && (
            <>
              <Field label="Workflow name">
                {input("name", "A proper welcome")}
              </Field>
              <Field
                label="Event name"
                hint="Your application sends this event through POST /v1/events."
              >
                {input("event_name", "user.created")}
              </Field>
              <Field label="Transactional template">
                <select
                  required
                  value={form.template_id ?? ""}
                  onChange={(e) => update("template_id", e.target.value)}
                >
                  <option value="">Choose a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!templates.length && (
                <p className="form-note">
                  Create a transactional template first.
                </p>
              )}
              <div className="form-grid">
                <Field label="From email">
                  {input("from_email", "", "email")}
                </Field>
                <Field label="Delay in minutes">
                  {input("delay_minutes", "0", "number")}
                </Field>
              </div>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  <option value="draft">Draft / paused</option>
                  <option value="active">Active</option>
                </select>
              </Field>
              <p className="form-note">
                Active workflows send real transactional emails when your app
                submits a matching event. Pausing stops new enrollments; already
                queued emails keep their schedule.
              </p>
            </>
          )}
          {kind === "domain" && (
            <>
              <Field label="Domain name">
                {input("name", "your-domain.com")}
              </Field>
              <p className="form-note">
                Adding a domain saves it to GeneSend. Onboard it separately in
                Cloudflare Email Service, then add it to SENDING_DOMAINS in your
                Worker configuration.
              </p>
            </>
          )}
          {kind === "key" && (
            <>
              <Field label="Key name">{input("name", "Production app")}</Field>
              <Field label="Permission">
                <select
                  value={form.scope}
                  onChange={(e) => update("scope", e.target.value)}
                >
                  <option value="send">Send emails & trigger events</option>
                  <option value="read">Read delivery status</option>
                  <option value="contacts">Manage contacts</option>
                </select>
              </Field>
              <p className="form-note">
                <ShieldCheck size={16} />
                Keys are hashed before storage and can be revoked at any time.
              </p>
            </>
          )}
          {kind === "suppression" && (
            <>
              <Field label="Email address">
                {input("email", "recipient@example.com", "email")}
              </Field>
              <p className="form-note">
                All future sends to this address will be blocked, including
                transactional mail.
              </p>
            </>
          )}
          {kind === "manage-contact" && (
            <>
              <p className="muted">
                Update preferences for <strong>{item?.email}</strong>.
              </p>
              <Field label="Preference">
                <select
                  value={form.contact_status ?? "unsubscribed"}
                  onChange={(e) => update("contact_status", e.target.value)}
                >
                  <option value="unsubscribed">
                    Unsubscribe from marketing
                  </option>
                  <option value="suppressed">Suppress all emails</option>
                </select>
              </Field>
              <p className="form-note">
                Existing opt-outs cannot be removed by importing this contact
                again.
              </p>
            </>
          )}
          {kind === "revoke-key" && (
            <p className="muted">
              Applications using <strong>{item?.name}</strong> will immediately
              lose access. You can create a replacement key at any time.
            </p>
          )}
          {err && (
            <div className="form-error" role="alert">
              {err}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className={`button ${kind === "revoke-key" ? "danger" : "primary"}`}
              disabled={busy || (kind === "automation" && !templates.length)}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : kind === "send" ? (
                <Send size={16} />
              ) : (
                <Check size={16} />
              )}{" "}
              {kind === "send"
                ? "Queue email"
                : kind === "import"
                  ? "Import contacts"
                  : kind === "key"
                    ? "Create key"
                    : kind === "revoke-key"
                      ? "Revoke key"
                      : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
function Dns({
  item,
  auth,
  onClose,
}: {
  item: Row;
  auth: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    if (auth)
      request(`/api/domains/${item.id}/dns`)
        .then((x) => setData(x.data))
        .catch((e) => setErr(e.message));
  }, [item.id, auth]);
  return (
    <Modal
      title={`DNS · ${item.name}`}
      description="Live DNS inspection. Domain onboarding is managed in Cloudflare."
      onClose={onClose}
      wide
    >
      {!auth ? (
        <p className="form-note">
          This is an example domain. Sign in to view live DNS records for your
          own domains.
        </p>
      ) : err ? (
        <p className="form-error">{err}</p>
      ) : !data ? (
        <div className="loading">
          <Loader2 className="spin" />
        </div>
      ) : (
        <>
          <div className="dns-status">
            <Badge status={data.ready ? "ready" : "pending"} />
            <p>
              {data.ready
                ? "The operator has enabled this domain for sending."
                : "Onboard this domain in Cloudflare Email Service, then update SENDING_DOMAINS."}
            </p>
          </div>
          {data.records.map((r: Row) => (
            <div className="dns-record" key={r.name}>
              <span className="tag">{r.type}</span>
              <strong>{r.name}</strong>
              <code>
                {r.values.length ? r.values.join("\n") : "No TXT records found"}
              </code>
            </div>
          ))}
          <p className="form-note">
            Ownership challenge: _genesend.{item.name} →{" "}
            {data.verification_token}. This challenge alone does not enable
            sending; Cloudflare onboarding is required.
          </p>
        </>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Close
        </button>
        <a
          className="button primary"
          href="https://dash.cloudflare.com/?to=/:account/email/sending"
          target="_blank"
          rel="noreferrer"
        >
          Open Cloudflare
          <ArrowUpRight size={15} />
        </a>
      </div>
    </Modal>
  );
}
function MessageDetail({
  item,
  inbound,
  onClose,
}: {
  item: Row;
  inbound: boolean;
  onClose: () => void;
}) {
  const [d, setD] = useState<Row | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    request(`/api/${inbound ? "inbound" : "emails"}/${item.id}`)
      .then((x) => setD(x.data))
      .catch((e) => setErr(e.message));
  }, [item.id, inbound]);
  return (
    <Modal
      title={item.subject}
      description={inbound ? item.from_email : item.to_email}
      onClose={onClose}
      wide
    >
      {err ? (
        <p className="form-error">{err}</p>
      ) : !d ? (
        <div className="loading">
          <Loader2 className="spin" />
        </div>
      ) : (
        <>
          {!inbound && (
            <div className="message-status">
              <Badge status={d.status} />
              <code>{d.provider_id ?? "No provider receipt yet"}</code>
              {d.error && <p className="form-error">{d.error}</p>}
            </div>
          )}
          <iframe
            title="Message content"
            sandbox=""
            className="email-preview"
            srcDoc={previewDoc(
              d.content?.html ||
                `<pre>${String(d.content?.text ?? "")
                  .replaceAll("&", "&amp;")
                  .replaceAll("<", "&lt;")}</pre>`,
            )}
          />
          {d.events && (
            <div className="event-list">
              {d.events.map((e: Row, i: number) => (
                <div key={i}>
                  <Clock size={14} />
                  <strong>{e.type}</strong>
                  <time>{new Date(e.created_at).toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
          {inbound && d.content?.attachments?.length > 0 && (
            <p className="form-note">
              Attachments (metadata only in v0.1):{" "}
              {d.content.attachments.map((a: Row) => a.filename).join(", ")}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
function SettingsPage({
  auth,
  config,
  onLogin,
  onSuppress,
}: {
  auth: boolean;
  config: Row;
  onLogin: () => void;
  onSuppress: () => void;
}) {
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <span className="tiny-eyebrow">YOUR WORKSPACE</span>
        <h2>A place of your own.</h2>
        <p>
          GeneSend is a self-hosted, single-owner email workspace. Your
          application and email data stay in your Cloudflare account.
        </p>
        <div className="settings-row">
          <span>Workspace</span>
          <strong>{auth ? "Gene’s workspace" : "Example workspace"}</strong>
        </div>
        <div className="settings-row">
          <span>Native email sending</span>
          <Badge
            status={
              auth ? (config.sending_enabled ? "active" : "disabled") : "sample"
            }
          />
        </div>
        <div className="settings-row">
          <span>Marketing delivery</span>
          <Badge
            status={
              auth
                ? config.marketing_enabled
                  ? "active"
                  : "pending"
                : "sample"
            }
          />
        </div>
        <div className="settings-row">
          <span>Authentication</span>
          <strong>Scoped API keys + secure owner session</strong>
        </div>
        {!auth && (
          <button className="button primary" onClick={onLogin}>
            Open your workspace
            <ArrowRight size={16} />
          </button>
        )}
      </section>
      <section className="panel settings-panel">
        <span className="tiny-eyebrow">A GOOD FOUNDATION</span>
        <h2>At home on Cloudflare.</h2>
        {[
          { name: "Workers", description: "Application, API & static assets" },
          { name: "D1", description: "Contacts, workflows & message state" },
          {
            name: "Queues",
            description: "Durable delivery jobs & dead letter queue",
          },
          { name: "R2", description: "Private email content" },
          {
            name: "Cron Triggers",
            description: "Scheduled dispatch & recovery",
          },
          {
            name: "Email Service",
            description:
              "Native transactional email; external adapters for Resend & SendGrid",
          },
        ].map((x) => (
          <div className="infrastructure-row" key={x.name}>
            <Cloud size={17} />
            <div>
              <strong>{x.name}</strong>
              <small>{x.description}</small>
            </div>
            <Check size={15} />
          </div>
        ))}
      </section>
      <section className="panel settings-panel">
        <h3>Recipient protection</h3>
        <p>
          Suppress recipients to prevent any future delivery attempts. Contact
          imports never remove opt-outs or suppressions.
        </p>
        <button className="button" onClick={onSuppress}>
          <ShieldCheck size={16} />
          Suppress an address
        </button>
      </section>
      <section className="panel settings-panel">
        <h3>Built in the open</h3>
        <p>
          MIT licensed. No per-contact software fees. Your Cloudflare usage is
          billed directly by Cloudflare.
        </p>
        <a
          className="button"
          href="https://github.com/Digidai/genedai-send"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          Explore the source
          <ArrowUpRight size={15} />
        </a>
      </section>
    </div>
  );
}
function Docs() {
  const [tab, setTab] = useState("quickstart");
  return (
    <div className="docs-layout">
      <nav className="docs-nav">
        {[
          { id: "quickstart", label: "Your first hello" },
          { id: "api", label: "API reference" },
          { id: "providers", label: "Provider setup" },
          { id: "architecture", label: "Architecture" },
          { id: "research", label: "Product research" },
          { id: "limits", label: "What’s included" },
        ].map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <ChevronRight size={14} />
          </button>
        ))}
      </nav>
      <article className="panel docs-content">
        {tab === "quickstart" ? (
          <>
            <span className="tiny-eyebrow">QUICKSTART</span>
            <h2>
              Good things start
              <br />
              <em>with a hello.</em>
            </h2>
            <p>
              GeneSend combines transactional email, contacts, reusable
              templates, and event-triggered automations in a workspace you own.
            </p>
            <h3>1. Settle in</h3>
            <p>
              Sign in with the operator access key. Add your sending domain to
              Cloudflare Email Service and the SENDING_DOMAINS configuration.
            </p>
            <h3>2. Create a sending key</h3>
            <p>
              Open API keys and create a key with Send permission. Store the
              secret in your application environment, never in a client-side
              bundle.
            </p>
            <h3>3. Send your first email</h3>
            <CodeSnippet />
            <p>
              The API returns 202 with a durable message ID. Follow progress in
              Email activity. An accepted message has a provider receipt; it
              does not prove inbox placement.
            </p>
          </>
        ) : tab === "api" ? (
          <>
            <h2>A small, familiar API.</h2>
            <p>
              Base URL: <code>https://send.genedai.me/v1</code>. Use{" "}
              <code>Authorization: Bearer gs_…</code>. All responses use JSON.
            </p>
            <div className="api-endpoint">
              <code>POST /emails</code>
              <span className="tag">send scope</span>
            </div>
            <p>
              Required: from, to, subject, and html or text. Optional:
              template_id, variables, scheduled_at (ISO timestamp within 30
              days). Use kind: marketing for subscribed contacts and a
              configured external channel. Set provider to cloudflare, resend,
              or sendgrid to override the workspace default.
            </p>
            <p>
              Use an Idempotency-Key header. Reusing the same key and payload
              returns the original message; a different payload returns 409.
              Keys are scoped to the calling API key.
            </p>
            <div className="api-endpoint">
              <code>GET /emails/:id</code>
              <span className="tag">read scope</span>
            </div>
            <p>
              Returns status, provider_id, and error. queued → enqueued →
              processing → accepted or delivered. failed, suppressed, and
              uncertain indicate investigation is needed.
            </p>
            <div className="api-endpoint">
              <code>POST /contacts</code>
              <span className="tag">contacts scope</span>
            </div>
            <p>
              Fields: email, name, tags (array), properties (object), opt_in
              (boolean). Existing opt-outs are preserved.
            </p>
            <div className="api-endpoint">
              <code>POST /events</code>
              <span className="tag">send scope</span>
            </div>
            <pre className="simple-code">
              {
                '{\n  "event_id": "signup_123",\n  "event": "user.created",\n  "email": "friend@example.com",\n  "properties": { "name": "Alex" }\n}'
              }
            </pre>
            <p>
              A unique event_id deduplicates each workflow enrollment. A
              matching active workflow queues a transactional email with its
              configured delay.
            </p>
          </>
        ) : tab === "providers" ? (
          <ProviderDocs />
        ) : tab === "architecture" ? (
          <>
            <h2>
              One cloud.
              <br />
              <em>Fewer moving parts.</em>
            </h2>
            <p>
              All application infrastructure runs in your Cloudflare account. A
              single Worker serves the React app, authenticates requests, and
              manages the API. Cloudflare, Resend, and SendGrid are supported
              sending channels.
            </p>
            <div className="architecture-flow">
              <span>React + REST API</span>
              <ArrowRight />
              <span>D1 outbox</span>
              <ArrowRight />
              <span>Queues</span>
              <ArrowRight />
              <span>Email Service</span>
            </div>
            <p>
              R2 holds private message content. D1 holds state and a
              transactional outbox. Cron dispatches due jobs every minute; Queue
              consumers claim messages atomically before delivery.
            </p>
            <h3>Failures deserve clear answers.</h3>
            <p>
              Known pre-delivery rate errors retry with backoff. An ambiguous
              provider response is marked uncertain rather than automatically
              resent. There is no claim of exactly-once external delivery.
            </p>
            <h3>Keep incoming mail close.</h3>
            <p>
              Resend and SendGrid are optional external delivery services.
              Encrypted credentials stay in D1, with AES-GCM keys derived from a
              Worker secret. The Worker includes an Email Routing handler. Add a
              dedicated address routing rule to the genesend Worker in
              Cloudflare. Existing MX records and routing rules are left under
              operator control. Incoming HTML is displayed in a sandboxed
              preview.
            </p>
            <a
              href="https://github.com/Digidai/genedai-send/blob/main/docs/architecture.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the full architecture
              <ArrowUpRight size={14} />
            </a>
          </>
        ) : tab === "research" ? (
          <>
            <h2>
              Inspired by the workflow.
              <br />
              <em>Built from first principles.</em>
            </h2>
            <p>
              AutoSend brings developer APIs and marketing tools into a shared
              project model. Its public documentation describes contacts, lists,
              segments, templates, campaigns, four automation trigger types,
              inbound mail, webhooks, and volume-based pricing.
            </p>
            <h3>The useful insight</h3>
            <p>
              The value is the connection between audience data, message
              composition, orchestration, and delivery evidence. GeneSend uses
              that workflow as a starting point for an independent, self-hosted
              implementation.
            </p>
            <h3>The architectural boundary</h3>
            <p>
              Cloudflare Email Service supports transactional mail only.
              GeneSend routes marketing through Resend or SendGrid; the
              application, audience, orchestration, and data remain on
              Cloudflare.
            </p>
            <h3>Evidence and scope</h3>
            <p>
              This research uses public website content, documentation, API
              references, and publicly displayed product visuals. It does not
              establish AutoSend’s private backend architecture, sending
              infrastructure, costs, or inbox performance.
            </p>
            <a
              href="https://github.com/Digidai/genedai-send/blob/main/docs/research/autosend-analysis.zh-CN.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the full product study
              <ArrowUpRight size={14} />
            </a>
          </>
        ) : (
          <>
            <h2>Clear on what’s here.</h2>
            <p>
              Version 0.1 is a self-hosted single-owner workspace. Features
              below reflect implemented behavior.
            </p>
            <table className="limits-table">
              <tbody>
                {[
                  [
                    "Email API",
                    "Native Cloudflare transactional sending, scheduled jobs, idempotency",
                  ],
                  [
                    "Audience",
                    "Contacts, tags, CSV import, consent states, suppressions",
                  ],
                  [
                    "Templates",
                    "HTML editor, live preview, escaped {{variables}}",
                  ],
                  [
                    "Campaigns",
                    "Audience snapshots, scheduling, rate limits, pause/cancel, Resend & SendGrid delivery",
                  ],
                  [
                    "Automations",
                    "Custom event → optional delay → one transactional email",
                  ],
                  [
                    "Inbox",
                    "Email Routing handler; read text/HTML and attachment metadata",
                  ],
                  [
                    "Analytics",
                    "Signed delivery webhooks, opt-in open/click tracking, created, accepted, failed, uncertain",
                  ],
                  [
                    "Security",
                    "Owner sessions, scoped hashed API keys, opt-out preservation",
                  ],
                  [
                    "Not included yet",
                    "Multi-user SaaS, billing, SMTP server, branching workflows, outbound customer webhooks, domain warmup, full attachment download",
                  ],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <th>{a}</th>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Public preview metrics are illustrative. Production starts empty.
              No real recipient is emailed by demo interactions.
            </p>
          </>
        )}
      </article>
    </div>
  );
}
function ProviderSettings({
  auth,
  config,
  onLogin,
  onSaved,
}: {
  auth: boolean;
  config: Row;
  onLogin: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Row>({
      provider: "resend",
      transactional_provider: "cloudflare",
      sender_name: "",
      postal_address: "",
    }),
    [state, setState] = useState<Row>({}),
    [busy, setBusy] = useState(""),
    [err, setErr] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      request("/api/providers").then((x) => {
        setState(x.data);
        setForm((f) => ({
          ...f,
          provider: x.data.provider,
          transactional_provider: x.data.transactional_provider,
          sender_name: x.data.sender_name,
          postal_address: x.data.postal_address,
        }));
      }),
    [],
  );
  useEffect(() => {
    if (auth) load().catch((e) => setErr(e.message));
  }, [auth, load]);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      onLogin();
      return;
    }
    setBusy("save");
    setErr("");
    setMessage("");
    try {
      await request("/api/providers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm((f) => ({
        ...f,
        resend_api_key: "",
        resend_webhook_secret: "",
        sendgrid_api_key: "",
        sendgrid_webhook_public_key: "",
      }));
      await load();
      onSaved();
      setMessage("Settings saved. Verify domains after adding a new API key.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const verify = async (provider: string) => {
    setBusy(provider);
    setErr("");
    setMessage("");
    try {
      const r = await request(`/api/providers/${provider}/verify`, {
        method: "POST",
        body: "{}",
      });
      setMessage(`${r.data.domains.length} verified sending domain(s) found.`);
      await load();
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="panel provider-settings">
      <div className="provider-heading">
        <div>
          <span className="tiny-eyebrow">THREE CHANNELS. ONE WORKSPACE.</span>
          <h2>Your emails, your choice.</h2>
          <p>
            Cloudflare for native transactional delivery. Resend and SendGrid
            for transactional and marketing mail.
          </p>
        </div>
        <a className="button" href="#docs">
          Setup documentation
          <BookOpen size={15} />
        </a>
      </div>
      <div className="provider-overview">
        <div>
          <Cloud size={22} />
          <strong>Cloudflare</strong>
          <small>
            {config.cloudflare_transport === "rest"
              ? "Email REST API"
              : "Native Worker binding"}
          </small>
          <Badge
            status={
              auth ? (config.sending_enabled ? "ready" : "pending") : "sample"
            }
          />
        </div>
        <div>
          <Send size={22} />
          <strong>Resend</strong>
          <small>API + signed webhooks</small>
          <Badge status={state.resend_configured ? "configured" : "pending"} />
        </div>
        <div>
          <Mail size={22} />
          <strong>SendGrid</strong>
          <small>Web API + signed webhooks</small>
          <Badge
            status={state.sendgrid_configured ? "configured" : "pending"}
          />
        </div>
      </div>
      {!auth ? (
        <div className="provider-login">
          <p>
            Open your private workspace to configure delivery channels.
            Credentials never appear in public previews.
          </p>
          <button className="button primary" onClick={onLogin}>
            Open workspace
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="Default transactional channel">
              <select
                value={form.transactional_provider}
                onChange={(e) => set("transactional_provider", e.target.value)}
              >
                <option value="cloudflare">Cloudflare Email Service</option>
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </Field>
            <Field label="Marketing channel">
              <select
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
              >
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Sender / organization name">
              <input
                value={form.sender_name}
                onChange={(e) => set("sender_name", e.target.value)}
                placeholder="Your organization"
                maxLength={100}
              />
            </Field>
            <Field
              label="Postal address"
              hint="Added to the footer of every marketing email."
            >
              <input
                value={form.postal_address}
                onChange={(e) => set("postal_address", e.target.value)}
                placeholder="Your organization’s postal address"
                maxLength={500}
              />
            </Field>
          </div>
          <details
            className="provider-details"
            open={form.provider === "resend"}
          >
            <summary>
              <span>Resend credentials</span>
              <Badge
                status={state.resend_configured ? "configured" : "pending"}
              />
            </summary>
            <div className="form-grid">
              <Field
                label="API key"
                hint={
                  state.resend_configured
                    ? "A key is stored. Leave blank to keep it."
                    : "Use a key with sending and domain read permissions."
                }
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={form.resend_api_key ?? ""}
                  placeholder="re_…"
                  onChange={(e) => set("resend_api_key", e.target.value)}
                />
              </Field>
              <Field
                label="Webhook signing secret"
                hint={
                  state.resend_webhook_configured
                    ? "Signing secret is stored. Leave blank to keep it."
                    : "From the Resend webhook endpoint settings."
                }
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={form.resend_webhook_secret ?? ""}
                  placeholder="whsec_…"
                  onChange={(e) => set("resend_webhook_secret", e.target.value)}
                />
              </Field>
            </div>
            <div className="verification-row">
              <div>
                <strong>Verified domains</strong>
                <p>
                  {state.resend_domains?.join(", ") ||
                    "No verified domains imported yet"}
                </p>
              </div>
              <button
                type="button"
                className="button"
                disabled={!!busy || !state.resend_configured}
                onClick={() => verify("resend")}
              >
                {busy === "resend" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <RefreshCw size={15} />
                )}
                Verify domains
              </button>
            </div>
          </details>
          <details
            className="provider-details"
            open={form.provider === "sendgrid"}
          >
            <summary>
              <span>SendGrid credentials</span>
              <Badge
                status={state.sendgrid_configured ? "configured" : "pending"}
              />
            </summary>
            <div className="form-grid">
              <Field
                label="API key"
                hint={
                  state.sendgrid_configured
                    ? "A key is stored. Leave blank to keep it."
                    : "Needs Mail Send and Domain Authentication read permissions."
                }
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={form.sendgrid_api_key ?? ""}
                  placeholder="SG.…"
                  onChange={(e) => set("sendgrid_api_key", e.target.value)}
                />
              </Field>
              <Field
                label="Event Webhook verification key"
                hint={
                  state.sendgrid_webhook_configured
                    ? "Verification key is stored. Leave blank to keep it."
                    : "Public verification key from SendGrid’s signed Event Webhook."
                }
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={form.sendgrid_webhook_public_key ?? ""}
                  placeholder="Base64 encoded public key"
                  onChange={(e) =>
                    set("sendgrid_webhook_public_key", e.target.value)
                  }
                />
              </Field>
            </div>
            <div className="verification-row">
              <div>
                <strong>Verified domains</strong>
                <p>
                  {state.sendgrid_domains?.join(", ") ||
                    "No verified domains imported yet"}
                </p>
              </div>
              <button
                type="button"
                className="button"
                disabled={!!busy || !state.sendgrid_configured}
                onClick={() => verify("sendgrid")}
              >
                {busy === "sendgrid" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <RefreshCw size={15} />
                )}
                Verify domains
              </button>
            </div>
          </details>
          <p className="form-note">
            <Lock size={16} />
            Credentials are encrypted in D1 with AES-GCM. Keep the Worker’s
            SESSION_SECRET safe; rotating it requires re-entering provider
            credentials.
          </p>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          {message && (
            <p className="provider-feedback" role="status">
              <CheckCircle2 size={16} />
              {message}
            </p>
          )}
          <div className="provider-save">
            <span>New keys are saved before domain verification.</span>
            <button className="button primary" disabled={!!busy}>
              {busy === "save" ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              Save provider settings
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
function CampaignControl({
  item,
  onClose,
  onSuccess,
}: {
  item: Row;
  onClose: () => void;
  onSuccess: (s: string) => void;
}) {
  const [review, setReview] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(""),
    [schedule, setSchedule] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    request(`/api/campaigns/${item.id}/review`)
      .then((x) => setReview(x.data))
      .catch((e) => setErr(e.message));
  }, [item.id]);
  const change = async (action: string) => {
    setBusy(action);
    setErr("");
    try {
      await request(`/api/campaigns/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          confirm: confirmed,
          scheduled_at: schedule ? new Date(schedule).toISOString() : undefined,
        }),
      });
      onSuccess(
        action === "send"
          ? "Campaign scheduled. Follow its progress in Campaigns."
          : `Campaign ${action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "resumed"}.`,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <Modal
      title={
        item.status === "draft" ? "One last look before hello." : item.name
      }
      description={
        item.status === "draft"
          ? "Review your audience and sending details. Launching sends real emails."
          : "Manage the remaining delivery jobs for this campaign."
      }
      onClose={onClose}
    >
      {!review && !err ? (
        <div className="loading">
          <Loader2 className="spin" />
        </div>
      ) : (
        review && (
          <>
            <div className="campaign-review">
              <div>
                <span>Campaign</span>
                <strong>{review.campaign.name}</strong>
              </div>
              <div>
                <span>Subject</span>
                <strong>{review.campaign.subject}</strong>
              </div>
              <div>
                <span>Sender</span>
                <strong>{review.campaign.from_email}</strong>
              </div>
              <div>
                <span>Channel</span>
                <strong>{review.provider}</strong>
              </div>
              <div>
                <span>Eligible subscribers now</span>
                <strong>{num(review.recipients)}</strong>
              </div>
              <div>
                <span>Send rate</span>
                <strong>
                  Up to {review.campaign.rate_per_minute} per minute
                </strong>
              </div>
              <div>
                <span>Organization</span>
                <strong>{review.sender_name || "Not configured"}</strong>
              </div>
              <div>
                <span>Postal address</span>
                <strong>{review.postal_address || "Not configured"}</strong>
              </div>
            </div>
            {item.status === "draft" ? (
              <>
                <Field
                  label="Schedule (optional)"
                  hint="Your local timezone. Leave blank to start on the next dispatch cycle."
                >
                  <input
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I reviewed this campaign and confirm these recipients opted
                    in. Start sending through the configured provider.
                  </span>
                </label>
                <p className="form-note">
                  The audience is snapshotted when sending begins. Subscription
                  and suppression states are checked again before each delivery.
                  Opens and clicks are signals, not proof a human read the
                  email.
                </p>
                <div className="modal-actions">
                  <button className="button" onClick={onClose}>
                    Keep draft
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !!busy ||
                      !confirmed ||
                      !review.configured ||
                      !review.recipients
                    }
                    onClick={() => change("send")}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    Schedule campaign
                  </button>
                </div>
                {!review.configured && (
                  <p className="form-note">
                    Configure your sending provider in Settings before
                    launching.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="form-note">
                  Pause and cancel stop future work. A provider call already in
                  progress can still complete.
                </p>
                <div className="modal-actions">
                  <button className="button" onClick={onClose}>
                    Close
                  </button>
                  {["running", "scheduled"].includes(item.status) && (
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() => change("pause")}
                    >
                      <Pause size={15} />
                      Pause
                    </button>
                  )}
                  {item.status === "paused" && (
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => change("resume")}
                    >
                      <Send size={15} />
                      Resume
                    </button>
                  )}
                  {["running", "scheduled", "paused"].includes(item.status) && (
                    <button
                      className="button danger"
                      disabled={!!busy}
                      onClick={() => change("cancel")}
                    >
                      <X size={15} />
                      Cancel remaining
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
    </Modal>
  );
}
function ProviderDocs() {
  return (
    <>
      <span className="tiny-eyebrow">PROVIDER SETUP</span>
      <h2>
        Bring your own
        <br />
        <em>sending channel.</em>
      </h2>
      <p>
        Cloudflare hosts your application, data, queue, content, and scheduler.
        Email delivery can use the native Cloudflare binding, Resend, or
        SendGrid. No external credentials are bundled or required to explore the
        workspace.
      </p>
      <h3>Cloudflare Email Service</h3>
      <p>
        Onboard your domain in Cloudflare Email Service. Cloudflare creates the
        authentication and bounce records. Set SENDING_DOMAINS and SEND_ENABLED
        in your Worker configuration, and include a send_email binding named
        EMAIL. Arbitrary-recipient sending requires an eligible Workers Paid
        account. Marketing is not permitted on this channel.
      </p>
      <h3>Resend</h3>
      <p>
        Verify your domain in Resend. In Settings, save an API key with sending
        and domain-read access, then click Verify domains. Configure
        https://send.genedai.me/webhooks/resend as a webhook endpoint and copy
        its whsec_ signing secret into Settings. Subscribe to sent, delivered,
        bounced, complained, failed, and suppressed email events.
      </p>
      <h3>SendGrid</h3>
      <p>
        Authenticate your domain in SendGrid. Create an API key with Mail Send
        and Domain Authentication read access. Save it in Settings, then click
        Verify domains. Set the signed Event Webhook endpoint to
        https://send.genedai.me/webhooks/sendgrid. Enable signature
        verification, and paste the public verification key into Settings. This
        adapter uses SendGrid’s global API endpoint.
      </p>
      <h3>Before your first campaign</h3>
      <p>
        Choose Resend or SendGrid as the marketing channel. Add your
        organization name and postal address. Import only opted-in contacts,
        create a campaign, review the audience, then schedule delivery. GeneSend
        appends an unsubscribe footer and one-click unsubscribe headers
        automatically. Open and click tracking are opt-in per campaign.
      </p>
      <h3>Keep the boundary clear</h3>
      <p>
        A successful API response indicates provider acceptance. Signed webhooks
        confirm later delivery outcomes. Delivery does not prove inbox
        placement. API credentials are encrypted in D1 using AES-GCM; their
        decryption key stays in a Cloudflare Worker secret.
      </p>
      <a
        href="https://github.com/Digidai/genedai-send/blob/main/docs/providers.zh-CN.md"
        target="_blank"
        rel="noreferrer"
      >
        Full setup and troubleshooting guide
        <ArrowUpRight size={14} />
      </a>
    </>
  );
}

export default App;
