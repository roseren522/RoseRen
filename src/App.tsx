import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  Leaf,
  Library,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  Trash2,
  Volume2,
  X,
  RefreshCw,
  PenLine,
  FileText,
  Keyboard,
  WifiOff,
  AlertCircle,
  CheckCheck,
  Info,
} from "lucide-react";
import { createEmptyCard, type Grade } from "ts-fsrs";
import { seed, sources, readings } from "./data";
import ReadingLab from "./components/ReadingLab";
import { AvatarEditor, AvatarView } from "./components/Avatar";
import { avatarEntryId, avatarPayload, type Avatar } from "./lib/profile";
import { readingHistory, readingSummary } from "./lib/reading";
import { highlightEntryId } from "./lib/highlights";
import { matchingVocabulary } from "./lib/readingVocabulary";
import { useLearning } from "./lib/useLearning";
import {
  acceptsAnswer,
  dayKey,
  recentDays,
  makeChoices,
  safeReference,
  entrySourceLink,
  scheduler,
  stage,
  statistics,
  topics,
  type Entry,
  type Topic,
} from "./lib/model";
import { cloud, cloudConfigured, db } from "./lib/store";
import { validateBackup } from "./lib/import";
type Page =
  | "dashboard"
  | "vocabulary"
  | "sources"
  | "statistics"
  | "personal"
  | "study"
  | "reading";
type Mode = "cards" | "choice" | "spelling";
const navItems = [
  { id: "dashboard", label: "今日学习", icon: BookOpen },
  { id: "vocabulary", label: "词汇书", icon: Library },
  { id: "reading", label: "Reading Lab", icon: GraduationCap },
  { id: "sources", label: "文献来源", icon: FileText },
  { id: "statistics", label: "学习统计", icon: ChartNoAxesCombined },
] as const;
const topicColors = ["sage", "sand", "blue", "lilac", "blue", "sand", "lilac"];
const topicEnglish = [
  "NITROGEN & CYCLING",
  "AGRICULTURE & SOIL",
  "EMISSIONS & EXCHANGE",
  "INVENTORIES & BOUNDARIES",
  "DATA & SPATIAL METHODS",
  "RESEARCH METHODS",
  "ACADEMIC EXPRESSIONS",
];
function Icon({ children }: { children: ReactNode }) {
  return <span className="icon-wrap">{children}</span>;
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Botanical() {
  return (
    <svg
      className="botanical"
      viewBox="0 0 300 265"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="153" cy="125" r="91" stroke="#b1c5ae" strokeDasharray="3 7" />
      <circle cx="153" cy="125" r="64" stroke="#c6d4bc" />
      <path
        d="M155 229V99M155 179c-50-3-77-28-83-66 49 2 79 21 83 66Z"
        stroke="#5b7c54"
        strokeWidth="1.5"
        fill="#b8cba4"
      />
      <path
        d="M156 142c49-9 67-39 62-79-43 13-66 39-62 79Z"
        fill="#8eae80"
        stroke="#5b7c54"
        strokeWidth="1.5"
      />
      <path
        d="M154 178 89 127m67 16 51-66M156 113c-30-13-45-34-39-63 34 14 45 35 39 63Z"
        stroke="#5b7c54"
        strokeWidth="1.5"
      />
      <path d="M124 62 155 111" stroke="#5b7c54" />
      <path d="M49 229h204" stroke="#b4c7ad" />
      <circle cx="60" cy="81" r="18" fill="#f5f7ec" stroke="#c6d4bc" />
      <text
        x="60"
        y="86"
        textAnchor="middle"
        fill="#577551"
        fontSize="13"
        fontFamily="Georgia"
      >
        N
      </text>
      <circle cx="245" cy="166" r="24" fill="#f5f7ec" stroke="#c6d4bc" />
      <text
        x="245"
        y="170"
        textAnchor="middle"
        fill="#577551"
        fontSize="12"
        fontFamily="Georgia"
      >
        NH₃
      </text>
      <path d="m44 174 7-4m191-121 7 5m-11 169 3-8" stroke="#8eaa7d" />
      <text
        x="151"
        y="254"
        textAnchor="middle"
        fill="#7b9272"
        letterSpacing="3"
        fontSize="8"
      >
        SMALL STEPS. DEEPER ROOTS.
      </text>
    </svg>
  );
}
export default function App() {
  const learning = useLearning();
  const { state, user, loading, authReady, save } = learning;
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const stats = statistics(state, new Date(clock));
  const readingEvents = [...state.readingReviews, ...state.readingVisits];
  const readingLog = readingHistory(readingEvents, readings);
  const readingStats = readingSummary(readingEvents, readings);
  const [page, setPage] = useState<Page>(() => {
    const p = location.hash.slice(1).split("/")[0];
    return [
      "vocabulary",
      "sources",
      "statistics",
      "personal",
      "reading",
    ].includes(p)
      ? (p as Page)
      : "dashboard";
  });
  const [mobileMenu, setMobileMenu] = useState(false),
    [query, setQuery] = useState(""),
    [topic, setTopic] = useState("全部主题"),
    [filter, setFilter] = useState("全部词汇"),
    [difficulty, setDifficulty] = useState("全部难度"),
    [sourceFilter, setSourceFilter] = useState("");
  const [detail, setDetail] = useState<Entry | null>(null),
    [auth, setAuth] = useState(false),
    [avatarEditing, setAvatarEditing] = useState(false),
    [settings, setSettings] = useState(false),
    [editing, setEditing] = useState<Entry | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [toast, setToast] = useState("");
  const [mode, setMode] = useState<Mode>("cards"),
    [queue, setQueue] = useState<string[]>([]),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [answer, setAnswer] = useState(""),
    [checked, setChecked] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false),
    reviewId = useRef(crypto.randomUUID()),
    searchRef = useRef<HTMLInputElement>(null),
    priorScope = useRef(learning.scope);
  const all = [...seed, ...Object.values(state.entries)].filter(
    (e) => !state.deleted.has(e.id),
  );
  const due = all
    .filter(
      (e) =>
        state.progress[e.id] &&
        state.progress[e.id].card.due.getTime() <= Date.now(),
    )
    .sort(
      (a, b) =>
        state.progress[a.id].card.due.getTime() -
        state.progress[b.id].card.due.getTime(),
    );
  const current = all.find((e) => e.id === queue[index]);
  useEffect(() => {
    if (current && !current.meaning.trim()) {
      setMode("cards");
      setRevealed(false);
      setChecked(null);
      setAnswer("");
    }
  }, [current?.id, current?.meaning]);
  const navigate = (target: Page) => {
    setPage(target);
    setMobileMenu(false);
    if (target !== "study") location.hash = target;
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const fn = () => {
      const p = location.hash.slice(1).split("/")[0];
      if (
        [
          "dashboard",
          "vocabulary",
          "sources",
          "statistics",
          "personal",
          "reading",
        ].includes(p)
      )
        setPage(p as Page);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (priorScope.current !== learning.scope) {
      priorScope.current = learning.scope;
      setQueue([]);
      setIndex(0);
      const route = location.hash.slice(1).split("/")[0];
      setPage(
        ["reading", "vocabulary", "sources", "statistics", "personal"].includes(
          route,
        )
          ? (route as Page)
          : "dashboard",
      );
      setDetail(null);
      setAvatarEditing(false);
    }
  }, [learning.scope]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notifyError = (err: unknown) => {
    setToast(err instanceof Error ? err.message : "操作未完成，请重试。");
  };
  const commit = async (
    kind: Parameters<typeof save>[0],
    payload: Record<string, unknown>,
    id?: string,
  ) => {
    try {
      await save(kind, payload, id);
      return true;
    } catch (err) {
      notifyError(err);
      return false;
    }
  };
  const favorite = (entry: Entry) => {
    void commit(
      "favorite",
      { value: !state.favorites.has(entry.id) },
      entry.id,
    );
  };
  const start = (
    options: {
      source?: string;
      topic?: Topic;
      difficult?: boolean;
      reviews?: boolean;
      mode?: Mode;
    } = {},
  ) => {
    let items: Entry[];
    if (options.source || options.topic || options.difficult)
      items = all
        .filter(
          (e) =>
            (!options.source || e.sourceId === options.source) &&
            (!options.topic || e.topic === options.topic) &&
            (!options.difficult || (state.progress[e.id]?.misses || 0) > 0),
        )
        .slice(0, 20);
    else if (options.reviews) items = due;
    else
      items = [
        ...due,
        ...all
          .filter((e) => !state.progress[e.id])
          .slice(0, Math.max(0, state.target - stats.fresh)),
      ];
    setQueue(items.map((e) => e.id));
    setIndex(0);
    setMode(options.mode || "cards");
    setRevealed(false);
    setAnswer("");
    setChecked(null);
    reviewId.current = crypto.randomUUID();
    navigate("study");
  };
  const rate = async (rating: Grade) => {
    if (
      !current ||
      busyRef.current ||
      !revealed ||
      (checked === false && rating !== 1)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      await save("review", { rating, mode }, current.id, reviewId.current);
      setIndex((v) => v + 1);
      setRevealed(false);
      setAnswer("");
      setChecked(null);
      reviewId.current = crypto.randomUUID();
    } catch (err) {
      notifyError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (
        document.querySelector("dialog[open]") ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (page === "study" && current) {
        if (event.code === "Space" && mode === "cards" && !revealed) {
          event.preventDefault();
          setRevealed(true);
        } else if (["1", "2", "3", "4"].includes(event.key) && revealed) {
          event.preventDefault();
          void rate(Number(event.key) as Grade);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const pronounce = (term: string) => {
    if (!("speechSynthesis" in window)) {
      setToast("此浏览器不支持语音朗读。");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(term);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.onerror = () => setToast("朗读暂不可用，请检查浏览器语音支持。");
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };
  const filtered = all.filter(
    (e) =>
      (!query ||
        [e.term, e.meaning, e.abbreviation || ""].some((text) =>
          text.toLowerCase().includes(query.trim().toLowerCase()),
        )) &&
      (topic === "全部主题" || e.topic === topic) &&
      (difficulty === "全部难度" || e.difficulty === difficulty) &&
      (!sourceFilter || e.sourceId === sourceFilter) &&
      (page !== "personal" || e.verification === "personal") &&
      (filter === "全部词汇" ||
        (filter === "已收藏" && state.favorites.has(e.id)) ||
        (filter === "易错词" && (state.progress[e.id]?.misses || 0) > 0) ||
        (filter === "未学习" && !state.progress[e.id])),
  );
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            events: learning.events,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fieldnotes-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setToast("学习记录已导出。请妥善保管备份。");
  };
  const syncLabels = {
    local: "已保存到此设备",
    saved: "云端已保存",
    pending: "等待同步",
    failed: "保存失败 · 重试",
    syncing: "正在同步",
  };
  const pageTitle =
    page === "personal"
      ? "我的词汇"
      : page === "study"
        ? "学习空间"
        : navItems.find((n) => n.id === page)?.label || "今日学习";
  const todayLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: state.timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <div className="app-shell">
      {mobileMenu && (
        <div className="mobile-backdrop" onClick={() => setMobileMenu(false)} />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <a
          className="brand"
          href="#dashboard"
          onClick={() => navigate("dashboard")}
        >
          <span className="brand-icon">
            <Sprout size={23} strokeWidth={1.7} />
          </span>
          <span>
            Fieldnotes<span className="brand-sub">研究英语 · 日有所学</span>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-avatar">R</div>
          <div>
            <strong>我的研究笔记</strong>
            <small>Environmental science</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">学习空间</div>
        <nav aria-label="主导航">
          {navItems.map(({ id, label, icon: ItemIcon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <ItemIcon size={18} />
              <span>{label}</span>
              {id === "dashboard" && <span className="nav-dot" />}
              {id === "vocabulary" && <small>{seed.length}</small>}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="nav-label">我的收藏夹</div>
        <button
          className={`nav-item ${page === "personal" ? "active" : ""}`}
          onClick={() => {
            setQuery("");
            setSourceFilter("");
            setFilter("全部词汇");
            setTopic("全部主题");
            navigate("personal");
          }}
        >
          <PenLine size={18} />
          <span>我的词汇</span>
          <Plus size={14} />
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setFilter("已收藏");
            setQuery("");
            setSourceFilter("");
            setTopic("全部主题");
            navigate("vocabulary");
          }}
        >
          <Bookmark size={18} />
          <span>收藏词汇</span>
          <small>
            {all.filter((entry) => state.favorites.has(entry.id)).length}
          </small>
        </button>
        <div className="sidebar-note">
          <span className="tiny-label">
            <Leaf size={14} /> 一点一滴，扎根生长
          </span>
          <p>
            从读懂一个词，
            <br />
            到更自信地表达研究。
          </p>
          <span className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            <span>偏好与数据</span>
          </button>
          <button className="account" onClick={() => setAuth(true)}>
            <span className="account-avatar">
              <AvatarView
                avatar={state.avatar}
                initial={user?.email?.slice(0, 1).toUpperCase() || "R"}
              />
            </span>
            <span>
              <strong>{user ? user.email?.split("@")[0] : "研究者"}</strong>
              <small>{user ? "个人学习账号" : "本地学习模式"}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileMenu(true)}
              aria-label="打开菜单"
            >
              <Menu size={20} />
            </button>
            <span>学习空间</span>
            <ChevronRight size={13} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <label className="top-search">
              <Search size={15} />
              <input
                ref={searchRef}
                placeholder="搜索研究词汇…"
                aria-label="搜索研究词汇"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSourceFilter("");
                  navigate("vocabulary");
                }}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className={`sync-status ${learning.status === "failed" ? "error" : ""}`}
              onClick={() => {
                if (user) void learning.sync();
                else setSettings(true);
              }}
              title={user ? "点击重试同步" : "当前记录仅保存在此浏览器"}
            >
              {learning.status === "syncing" ? (
                <LoaderCircle size={14} className="spin" />
              ) : learning.status === "failed" ? (
                <AlertCircle size={14} />
              ) : user ? (
                <Cloud size={15} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              <span>{syncLabels[learning.status]}</span>
            </button>
            <div className="top-divider" />
            <button
              className="top-avatar"
              onClick={() => setAuth(true)}
              aria-label="账号与登录"
            >
              <AvatarView
                avatar={state.avatar}
                initial={user?.email?.slice(0, 1).toUpperCase() || "R"}
              />
            </button>
          </div>
        </header>
        {!learning.online && (
          <div className="offline-banner">
            <WifiOff size={15} />{" "}
            当前离线。学习操作将先保存到此设备；登录账号的记录会在联网后重试同步。
          </div>
        )}
        {learning.error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{learning.error}</span>
            <button onClick={() => void learning.sync()}>重试</button>
          </div>
        )}
        <main>
          {loading || !authReady ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              <p>正在恢复你的学习记录…</p>
            </div>
          ) : (
            <>
              {page === "reading" && (
                <>
                  {learning.unmergedReadingCount > 0 && (
                    <div className="reading-merge-notice" role="status">
                      检测到本设备有登录前的阅读记录，尚未合并到当前账号。
                      <button
                        className="text-button"
                        onClick={() => setAuth(true)}
                      >
                        打开账号面板合并本地记录
                      </button>
                    </div>
                  )}
                  <ReadingLab
                    vocabulary={all}
                    saveVocabulary={async (
                      entry,
                      entryEventId,
                      favoriteEventId,
                    ) => {
                      const existing = matchingVocabulary(entry.term, all);
                      const target = existing || entry;
                      if (!existing)
                        await save("entry", { entry }, entry.id, entryEventId);
                      if (!state.favorites.has(target.id))
                        await save(
                          "favorite",
                          { value: true },
                          target.id,
                          favoriteEventId,
                        );
                    }}
                    scope={learning.scope}
                    userId={user?.id}
                    restoringAccount={
                      Boolean(user) && !learning.hasCloudSnapshot
                    }
                    events={readingEvents}
                    highlightEvents={state.readingHighlights}
                    saveHighlight={(payload, eventId) =>
                      save(
                        "entry",
                        payload,
                        highlightEntryId(payload.highlightId),
                        eventId,
                      )
                    }
                    saveProgress={(payload) =>
                      save(
                        "entry",
                        payload,
                        `reading-progress:${payload.lessonId}`,
                      )
                    }
                    saveReview={(payload, entryId, id) =>
                      save("review", payload, entryId, id)
                    }
                    studyVocabulary={(entries) => {
                      setQueue(entries.map((e) => e.id));
                      setIndex(0);
                      setMode("cards");
                      setRevealed(false);
                      setChecked(null);
                      setAnswer("");
                      reviewId.current = crypto.randomUUID();
                      navigate("study");
                    }}
                  />
                </>
              )}
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR DAILY FIELDNOTES</div>
                      <h1>
                        让研究英语，慢慢成为你的语言
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>每天一点积累，让读论文和表达想法都更从容。</p>
                    </div>
                    <div className="date-label">
                      <CalendarDays size={16} />
                      {todayLabel}
                    </div>
                  </div>
                  <div className="dashboard-hero">
                    <section className="hero-card">
                      <div className="hero-copy">
                        <span className="hero-tag">
                          <span /> 为你的研究而学
                        </span>
                        <h2>
                          从一个词出发，
                          <br />
                          读懂更广阔的世界。
                        </h2>
                        <p>
                          在真实科学语境中，积累环境科学研究英语。
                          <br />
                          今天的每一次复习，都会成为明天的底气。
                        </p>
                        <button
                          className="button primary hero-button"
                          onClick={() => start()}
                        >
                          {stats.total ? "继续今日学习" : "开始今日学习"}
                          <ArrowRight size={17} />
                        </button>
                        <div className="hero-footnote">
                          <Check size={13} /> 可信词源<span>·</span>FSRS
                          间隔复习<span>·</span>中英双语
                        </div>
                      </div>
                      <Botanical />
                    </section>
                    <section className="daily-plan panel">
                      <div className="section-title">
                        <h3>今日计划</h3>
                        <span className="soft-badge">每日积累</span>
                      </div>
                      <div className="target-count">
                        <strong>
                          {stats.fresh}
                          <span> / {state.target}</span>
                        </strong>
                        <span>新词已学习</span>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${Math.min(100, (stats.fresh / state.target) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="plan-summary">
                        <span>
                          待复习 <b>{due.length}</b> 词
                        </span>
                        <span>
                          已复习 <b>{stats.reviews}</b> 词次
                        </span>
                      </div>
                      <div className="plan-target">
                        <span>每日新词目标</span>
                        <div
                          className="target-options"
                          role="group"
                          aria-label="每日新词目标"
                        >
                          {[5, 10, 15, 20].map((n) => (
                            <button
                              key={n}
                              aria-pressed={state.target === n}
                              className={state.target === n ? "selected" : ""}
                              onClick={() =>
                                void commit("target", { value: n })
                              }
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="stats-row">
                    <Stat
                      icon={<BookOpen size={18} />}
                      label="今日新词"
                      value={stats.fresh}
                      unit="词"
                      caption={`每日目标 ${state.target} 词`}
                      color="sage"
                    />
                    <Stat
                      icon={<RefreshCw size={17} />}
                      label="到期复习"
                      value={due.length}
                      unit="词"
                      caption={
                        due.length
                          ? "现在复习，巩固记忆"
                          : "记忆计划会随学习生成"
                      }
                      color="sand"
                      onClick={() => start({ reviews: true })}
                    />
                    <Stat
                      icon={<Sprout size={20} />}
                      label="连续学习"
                      value={stats.streak}
                      unit="天"
                      caption="让一点进步持续发生"
                      color="sage"
                    />
                    <Stat
                      icon={<GraduationCap size={20} />}
                      label="累计学习"
                      value={stats.learned}
                      unit="词"
                      caption={`${stats.retained} 词进入长期保持`}
                      color="blue"
                    />
                  </div>
                  <button
                    className="reading-dashboard-link"
                    onClick={() => navigate("reading")}
                  >
                    <span className="reading-dashboard-icon">
                      <GraduationCap size={24} />
                    </span>
                    <span>
                      <strong>
                        {readingLog.length
                          ? `继续阅读 · ${readingLog[0].lesson.title}`
                          : "Reading Lab · Go beyond the word."}
                      </strong>
                      <small>
                        {readingLog.length
                          ? `已记录 ${readingLog.length} 篇阅读 · 已完成 ${readingStats.complete} 篇练习 · 已保存 ${readingStats.answered} 道回答`
                          : `${readings.length} English passages · multiple-choice & written-response practice · atmospheric science, inventories and research methods`}
                      </small>
                    </span>
                    <ArrowRight size={19} />
                  </button>
                  <div className="lower-grid">
                    <section className="topic-section">
                      <div className="section-heading">
                        <div>
                          <h2>沿着研究兴趣，拓展词汇</h2>
                          <p>从氮循环到研究方法，每个词都有它的语境。</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFilter("全部词汇");
                            setSourceFilter("");
                            setTopic("全部主题");
                            navigate("vocabulary");
                          }}
                        >
                          全部主题
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className="topic-grid">
                        {topics.slice(0, 4).map((t, i) => {
                          const count = seed.filter(
                            (e) => e.topic === t,
                          ).length;
                          const studied = seed.filter(
                            (e) => e.topic === t && state.progress[e.id],
                          ).length;
                          return (
                            <button
                              className={`topic-card ${topicColors[i]}`}
                              key={t}
                              onClick={() => {
                                setTopic(t);
                                setQuery("");
                                setFilter("全部词汇");
                                setSourceFilter("");
                                navigate("vocabulary");
                              }}
                            >
                              <div className="topic-card-top">
                                <span className="topic-icon">
                                  {i === 0 ? (
                                    <FlaskConical size={21} />
                                  ) : i === 1 ? (
                                    <Sprout size={22} />
                                  ) : i === 2 ? (
                                    <Cloud size={22} />
                                  ) : (
                                    <ChartNoAxesCombined size={21} />
                                  )}
                                </span>
                                <ArrowUpRight size={17} />
                              </div>
                              <span className="topic-english">
                                {topicEnglish[i]}
                              </span>
                              <h3>{t}</h3>
                              <div className="topic-card-bottom">
                                <span>{count} 个词汇</span>
                                <small>
                                  {studied}/{count} 已学习
                                </small>
                              </div>
                              <div className="mini-track">
                                <span
                                  style={{
                                    width: `${(studied / count) * 100}%`,
                                  }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                    <section className="word-spotlight panel">
                      <div className="section-title">
                        <h3>词汇手记</h3>
                        <span className="tiny-label">WORD IN CONTEXT</span>
                      </div>
                      <div className="spotlight-word">
                        <span>01 / NITROGEN</span>
                        <h2>
                          ammonia{" "}
                          <button
                            className="icon-button"
                            aria-label="朗读 ammonia"
                            onClick={() => pronounce("ammonia")}
                          >
                            <Volume2 size={19} />
                          </button>
                        </h2>
                        <div>
                          <span className="pos">noun</span>
                          <b>氨</b>
                          <span className="formula">NH₃</span>
                        </div>
                      </div>
                      <p className="spotlight-example">
                        “We compared ammonia fluxes
                        <br className="desktop-break" /> over two croplands.”
                      </p>
                      <span className="example-note">本站原创科研例句</span>
                      <div className="spotlight-source">
                        <ShieldCheck size={15} />
                        <span>CMAQ 技术指南 · 已核验出现位置</span>
                      </div>
                      <button
                        className="text-button spotlight-link"
                        onClick={() => setDetail(seed[0])}
                      >
                        展开词义与来源
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                  <div className="evidence-strip">
                    <ShieldCheck size={18} />
                    <p>
                      <strong>学习有据可循。</strong> {seed.length}{" "}
                      个词条，来自官方技术文档及开放获取文献。来源与核验范围分别标注，原文摘录注明出处。
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("sources")}
                    >
                      查看词源
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {(page === "vocabulary" || page === "personal") && (
                <>
                  <PageHeading
                    eyebrow={
                      page === "personal"
                        ? "YOUR RESEARCH LEXICON"
                        : "THE RESEARCH LEXICON"
                    }
                    title={
                      page === "personal"
                        ? "把论文里的新词，留在这里。"
                        : "你的研究词汇书"
                    }
                    description={
                      page === "personal"
                        ? "记录自己的词汇、阅读语境与参考文献。个人词条不会自动标为已核验。"
                        : `${seed.length} 个词条 · 在科学语境中理解，而不只是记住翻译。`
                    }
                  >
                    {(page === "personal" || filter === "已收藏") &&
                      filtered.length > 0 && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            setQueue(
                              [...filtered]
                                .sort(
                                  (a, b) =>
                                    Number(Boolean(state.progress[a.id])) -
                                      Number(Boolean(state.progress[b.id])) ||
                                    (state.progress[a.id]?.card.due.getTime() ||
                                      0) -
                                      (state.progress[
                                        b.id
                                      ]?.card.due.getTime() || 0),
                                )
                                .slice(0, 20)
                                .map((entry) => entry.id),
                            );
                            setIndex(0);
                            setMode("cards");
                            setRevealed(false);
                            setChecked(null);
                            setAnswer("");
                            reviewId.current = crypto.randomUUID();
                            navigate("study");
                          }}
                        >
                          <BookOpen size={16} />
                          {page === "personal"
                            ? "学习我的词汇"
                            : "学习收藏词汇"}
                        </button>
                      )}
                    <button
                      className="button secondary"
                      onClick={() => setImporting(true)}
                    >
                      <FileText size={16} />
                      从段落提取
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setEditing("new")}
                    >
                      <Plus size={17} />
                      添加词汇
                    </button>
                  </PageHeading>
                  <div className="filter-bar">
                    <label className="search-box">
                      <Search size={17} />
                      <input
                        aria-label="搜索词汇书"
                        placeholder="搜索英文、中文或缩写…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <button
                          className="icon-button"
                          onClick={() => setQuery("")}
                          aria-label="清空搜索"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </label>
                    <select
                      aria-label="筛选主题"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    >
                      {["全部主题", ...topics].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      aria-label="筛选难度"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      {["全部难度", "基础", "进阶", "深入"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="list-tabs">
                    {["全部词汇", "未学习", "已收藏", "易错词"].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "active" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                    <span>{filtered.length} 个词条</span>
                  </div>
                  {sourceFilter && (
                    <div className="source-filter">
                      文献：{sources.find((s) => s.id === sourceFilter)?.title}
                      <button
                        className="text-button"
                        onClick={() => setSourceFilter("")}
                      >
                        清除
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {filtered.length ? (
                    <div className="word-table">
                      <div className="table-head">
                        <span>词汇 / EXPRESSION</span>
                        <span>释义 / Definition</span>
                        <span>主题</span>
                        <span>学习状态</span>
                        <span />
                      </div>
                      {filtered.map((e) => (
                        <div className="word-row" key={e.id}>
                          <button
                            className="word-title"
                            onClick={() => setDetail(e)}
                          >
                            <strong>{e.term}</strong>
                            <small>
                              {e.pos}
                              {e.abbreviation && ` · ${e.abbreviation}`}
                            </small>
                          </button>
                          <span>{e.meaning || "Definition pending"}</span>
                          <span className="topic-pill">{e.topic}</span>
                          <span
                            className={`stage ${state.progress[e.id] ? "learning" : ""}`}
                          >
                            <i />
                            {stage(state.progress[e.id])}
                          </span>
                          <button
                            className={`icon-button bookmark ${state.favorites.has(e.id) ? "is-favorite" : ""}`}
                            onClick={() => favorite(e)}
                            aria-label={`${state.favorites.has(e.id) ? "取消收藏" : "收藏"} ${e.term}`}
                          >
                            <Bookmark
                              size={18}
                              fill={
                                state.favorites.has(e.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={<Search size={30} />}
                      title={
                        page === "personal"
                          ? "还没有符合条件的个人词汇"
                          : "没有找到匹配的词汇"
                      }
                      text="试试其他关键词，或从正在阅读的论文添加新词。"
                    >
                      <button
                        className="button secondary"
                        onClick={() => {
                          setQuery("");
                          setTopic("全部主题");
                          setFilter("全部词汇");
                          setDifficulty("全部难度");
                          setSourceFilter("");
                        }}
                      >
                        清除筛选
                      </button>
                      <button
                        className="button primary"
                        onClick={() => setEditing("new")}
                      >
                        添加词汇
                      </button>
                    </Empty>
                  )}
                </>
              )}
              {page === "sources" && (
                <>
                  <PageHeading
                    eyebrow="GROUNDED IN SCIENCE"
                    title="每一个词，都有出处。"
                    description="按技术指南和开放获取文献浏览词汇，回到它们真实出现的研究语境。"
                  />
                  <div className="source-intro">
                    <ShieldCheck size={22} />
                    <div>
                      <h3>
                        {seed.length} 个词条 ·{" "}
                        {sources.filter((s) => s.kind !== "article").length}{" "}
                        个技术章节 ·{" "}
                        {sources.filter((s) => s.kind === "article").length}{" "}
                        篇开放文献
                      </h3>
                      <p>
                        技术指南已检查原文；每日文献自动检查摘要中的词语出现与转载许可。释义未经独立学术审稿。原文摘录与原创例句分别标注。
                      </p>
                    </div>
                  </div>
                  <div className="source-grid">
                    {sources.map((s, i) => (
                      <article className="source-card panel" key={s.id}>
                        <div className="source-top">
                          <div className="source-document">
                            <FileText size={24} />
                          </div>
                          <span className="verified-badge">
                            <ShieldCheck size={13} />{" "}
                            {s.kind === "article"
                              ? "自动提取 · 仅摘要"
                              : "官方库全文已检查"}
                          </span>
                        </div>
                        <div className="source-kicker">
                          {s.kind === "article"
                            ? "OPEN-ACCESS ARTICLE"
                            : "TECHNICAL GUIDANCE"}{" "}
                          · {s.year}
                        </div>
                        <h2>{s.title}</h2>
                        <p>{s.organization}</p>
                        {s.kind === "article" && (
                          <p>
                            {s.authors} · {s.license}
                          </p>
                        )}
                        <div className="source-scope">{s.scope}</div>
                        <div className="source-card-footer">
                          <button
                            className="text-button"
                            onClick={() => {
                              setSourceFilter(s.id);
                              setQuery("");
                              setTopic("全部主题");
                              setFilter("全部词汇");
                              navigate("vocabulary");
                            }}
                          >
                            {seed.filter((e) => e.sourceId === s.id).length}{" "}
                            个词汇
                            <ArrowRight size={15} />
                          </button>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`打开 ${s.title}`}
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>
                        <button
                          className="source-study"
                          onClick={() => start({ source: s.id })}
                        >
                          学习来源词汇
                          <ChevronRight size={14} />
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="scope-note">
                    <h3>
                      <BookOpen size={18} /> 关于当前词库的范围
                    </h3>
                    <p>
                      当前词库包含 CMAQ 大气化学、模型评估与地表交换文档，以及
                      IPCC 2006
                      指南的数据收集、不确定性、固定源燃烧和土壤排放章节。CMAQ
                      来源固定到已核验的版本，其概述页注明指南为经 CMAS
                      审阅的草稿。
                    </p>
                    <p>
                      IPCC
                      章节已检查官方全文。请遵循各章实际范围：温室气体方法不能泛化为所有氮物种或完整氮收支。畜牧粪污和全面的全球氮收支仍需更多可靠资料。Reading
                      Lab
                      中的段落为依据来源编写的学习改写，题目、参考答案和解析均为英文。
                    </p>
                    <p>
                      没有引用不可访问的论文全文，也没有推测 DOI
                      或页码。每个已核验词条提供来源链接、页码或行号与词语出现证据。
                    </p>
                  </div>
                </>
              )}
              {page === "study" && (
                <>
                  <div className="study-top">
                    <button
                      className="text-button"
                      onClick={() => navigate("dashboard")}
                    >
                      <ArrowLeft size={16} />
                      返回今日学习
                    </button>
                    <span>
                      {Math.min(index, queue.length)} / {queue.length} 完成
                    </span>
                  </div>
                  <div className="study-progress">
                    <span
                      style={{
                        width: `${queue.length ? (index / queue.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {!current ? (
                    <Empty
                      icon={<CheckCheck size={36} />}
                      title={
                        queue.length
                          ? "这一次积累，已记下。"
                          : "现在没有待学习的词汇"
                      }
                      text={
                        queue.length
                          ? `已完成 ${queue.length} 个词条。复习时间已由 FSRS 安排；到期后会显示在首页。`
                          : "你已完成当前计划，或所选范围没有词汇。可以浏览词汇书，选择一个感兴趣的主题。"
                      }
                    >
                      <button
                        className="button primary"
                        onClick={() => navigate("dashboard")}
                      >
                        回到今日学习
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => navigate("vocabulary")}
                      >
                        浏览词汇书
                      </button>
                    </Empty>
                  ) : (
                    <>
                      <div className="study-heading">
                        <div>
                          <div className="eyebrow">
                            ONE WORD, A LITTLE FURTHER
                          </div>
                          <h1>
                            {mode === "cards"
                              ? "在语境中，记住这个词。"
                              : mode === "choice"
                                ? "读懂它的科学含义。"
                                : "用英语，把意思写出来。"}
                          </h1>
                        </div>
                        <div className="mode-switch" aria-label="练习方式">
                          {(
                            [
                              ["cards", "闪卡"],
                              ["choice", "选择"],
                              ["spelling", "拼写"],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              className={mode === id ? "active" : ""}
                              disabled={
                                id !== "cards" && !current.meaning.trim()
                              }
                              onClick={() => {
                                setMode(id);
                                setRevealed(false);
                                setChecked(null);
                                setAnswer("");
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <section className="flashcard">
                        <div className="flashcard-meta">
                          <span className="topic-pill">{current.topic}</span>
                          <div>
                            <span>{current.difficulty}</span>
                            <button
                              className={`icon-button ${state.favorites.has(current.id) ? "is-favorite" : ""}`}
                              onClick={() => favorite(current)}
                              aria-label="收藏当前词汇"
                            >
                              <Bookmark
                                size={18}
                                fill={
                                  state.favorites.has(current.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                          </div>
                        </div>
                        <div className="flashcard-prompt">
                          <span className="tiny-label">
                            {mode === "spelling"
                              ? "根据释义拼写英文"
                              : "RESEARCH VOCABULARY"}
                          </span>
                          <h2>
                            {mode === "spelling"
                              ? current.meaning
                              : current.term}
                          </h2>
                          {mode !== "spelling" && (
                            <div className="pronunciation">
                              <span>{current.pos}</span>
                              {current.abbreviation && (
                                <span className="formula">
                                  {current.abbreviation}
                                </span>
                              )}
                              <button
                                className="icon-button"
                                onClick={() => pronounce(current.term)}
                                aria-label="朗读当前词汇"
                              >
                                <Volume2 size={20} />
                              </button>
                            </div>
                          )}
                          {!current.meaning.trim() && (
                            <p className="reading-word-pending">
                              Definition pending. Review this word in its saved
                              reading context. Add a definition in the word
                              editor to enable meaning and spelling quizzes.
                            </p>
                          )}
                          {mode === "cards" && !revealed && (
                            <button
                              className="reveal-button"
                              onClick={() => setRevealed(true)}
                            >
                              点击查看释义<kbd>Space</kbd>
                              <ChevronDown size={15} />
                            </button>
                          )}
                          {mode === "choice" && !revealed && (
                            <div className="choices">
                              {makeChoices(current, all).map((choice, i) => (
                                <button
                                  key={choice.id}
                                  onClick={() => {
                                    setAnswer(choice.meaning);
                                    setChecked(choice.id === current.id);
                                    setRevealed(true);
                                  }}
                                >
                                  <span>{String.fromCharCode(65 + i)}</span>
                                  {choice.meaning}
                                </button>
                              ))}
                            </div>
                          )}
                          {mode === "spelling" && !revealed && (
                            <form
                              className="spelling-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (answer.trim()) {
                                  setChecked(acceptsAnswer(current, answer));
                                  setRevealed(true);
                                }
                              }}
                            >
                              <label htmlFor="spell-answer">
                                英文单词或短语
                              </label>
                              <input
                                id="spell-answer"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Type your answer…"
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                              <button
                                className="button primary"
                                disabled={!answer.trim()}
                              >
                                检查答案
                                <ArrowRight size={16} />
                              </button>
                              <small>
                                忽略大小写与多余空格，接受词条中记录的变体。
                              </small>
                            </form>
                          )}
                        </div>
                        {revealed && (
                          <div className="answer-panel">
                            {checked !== null && (
                              <div
                                className={`answer-feedback ${checked ? "correct" : "incorrect"}`}
                                role="status"
                              >
                                {checked ? (
                                  <CheckCircle2 size={19} />
                                ) : (
                                  <RefreshCw size={18} />
                                )}
                                <div>
                                  <strong>
                                    {checked
                                      ? "理解正确，继续积累。"
                                      : "再认识一次，也是一种进步。"}
                                  </strong>
                                  <span>
                                    {!checked && `你的答案：${answer} · `}
                                    正确答案：
                                    {mode === "spelling"
                                      ? current.term
                                      : current.meaning}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="answer-definition">
                              <h3>
                                {current.meaning || "Definition pending"}
                                {mode === "spelling" && (
                                  <span>{current.term}</span>
                                )}
                              </h3>
                              <p>{current.explanation}</p>
                            </div>
                            <div className="collocations">
                              {current.collocations.map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </div>
                            <div className="example-block">
                              <span className="tiny-label">
                                {current.exampleKind === "reading"
                                  ? "阅读语境 · READING CONTEXT"
                                  : current.exampleKind === "quotation"
                                    ? "摘要原文 · SOURCE QUOTATION"
                                    : "原创科研例句 · ORIGINAL EXAMPLE"}
                              </span>
                              <p>{current.example}</p>
                              <small>{current.translation}</small>
                            </div>
                            <div className="confusion-note">
                              <span>留意区别</span>
                              {current.related}
                            </div>
                            <button
                              className="text-button"
                              onClick={() => setDetail(current)}
                            >
                              <ShieldCheck size={14} />
                              查看词源与概念依据
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                        )}
                      </section>
                      {revealed && (
                        <div className="rating-area">
                          <p>
                            这次记得怎么样？
                            <span>你的反馈决定下次复习时间</span>
                          </p>
                          <div className="rating-buttons">
                            {(
                              [
                                ["Again", "再学一次", 1],
                                ["Hard", "有点困难", 2],
                                ["Good", "记住了", 3],
                                ["Easy", "很轻松", 4],
                              ] as const
                            ).map(([en, zh, n]) => {
                              const next = scheduler.next(
                                state.progress[current.id]?.card ||
                                  createEmptyCard(),
                                new Date(),
                                n,
                              );
                              const minutes = Math.round(
                                (next.card.due.getTime() - Date.now()) / 60000,
                              );
                              return (
                                <button
                                  key={en}
                                  disabled={
                                    busy || (checked === false && n !== 1)
                                  }
                                  className={`rating rating-${n}`}
                                  onClick={() => void rate(n)}
                                >
                                  <div>
                                    <kbd>{n}</kbd>
                                    <strong>{en}</strong>
                                  </div>
                                  <span>{zh}</span>
                                  <small>
                                    {minutes < 60
                                      ? `${Math.max(1, minutes)} 分钟后`
                                      : minutes < 1440
                                        ? `${Math.round(minutes / 60)} 小时后`
                                        : `${Math.round(minutes / 1440)} 天后`}
                                  </small>
                                </button>
                              );
                            })}
                          </div>
                          {checked === false && (
                            <small className="rating-note">
                              本次答错，请选择
                              Again。不会把一次选择正确视为已掌握。
                            </small>
                          )}
                        </div>
                      )}
                      <div className="study-shortcuts">
                        <Keyboard size={15} />
                        {mode === "cards" ? (
                          <span>
                            <kbd>Space</kbd> 显示释义
                          </span>
                        ) : (
                          <span>先完成练习，再评价记忆</span>
                        )}
                        <span>
                          <kbd>1</kbd>–<kbd>4</kbd> 评价记忆
                        </span>
                        <span>FSRS · 目标保持率 90%</span>
                      </div>
                    </>
                  )}
                </>
              )}
              {page === "statistics" && (
                <>
                  <PageHeading
                    eyebrow="GROWTH, ONE DAY AT A TIME"
                    title="让每一点积累，看得见。"
                    description="统计只来自你的真实学习记录，按偏好中的时区计算。"
                  >
                    <button className="button secondary" onClick={exportData}>
                      <Download size={16} />
                      导出学习记录
                    </button>
                  </PageHeading>
                  <div className="stats-row">
                    <Stat
                      icon={<Sprout size={19} />}
                      label="连续学习"
                      value={stats.streak}
                      unit="天"
                      caption="今日或昨日开始的连续记录"
                      color="sage"
                    />
                    <Stat
                      icon={<BookOpen size={19} />}
                      label="累计学习"
                      value={stats.learned}
                      unit="词"
                      caption="至少有一次复习记录"
                      color="blue"
                    />
                    <Stat
                      icon={<RefreshCw size={18} />}
                      label="累计复习"
                      value={state.reviews.length}
                      unit="次"
                      caption="包含首次学习记录"
                      color="sand"
                    />
                    <Stat
                      icon={<GraduationCap size={20} />}
                      label="长期保持"
                      value={stats.retained}
                      unit="词"
                      caption="至少 3 次评价且稳定性 ≥21 天"
                      color="sage"
                    />
                  </div>
                  <section className="panel activity-panel">
                    <div className="section-heading">
                      <div>
                        <h2>最近 28 天的足迹</h2>
                        <p>{state.timezone} · 每一格，都是一次靠近。</p>
                      </div>
                      <span className="tiny-label">DAILY PRACTICE</span>
                    </div>
                    <div className="activity-grid">
                      {recentDays(stats.today).map((key) => {
                        const count = [
                          ...state.reviews,
                          ...state.readingReviews,
                        ].filter(
                          (e) => dayKey(e.at, state.timezone) === key,
                        ).length;
                        return (
                          <div
                            className={`activity-cell level-${Math.min(3, Math.ceil(count / 5))}`}
                            key={key}
                            title={`${key} · ${count} 次学习`}
                          >
                            <small>{key.slice(5).replace("-", "/")}</small>
                            <strong>{count || "·"}</strong>
                          </div>
                        );
                      })}
                    </div>
                    <p className="stats-footnote">
                      今日：{stats.fresh} 个新词，{stats.reviews} 次词汇复习，
                      {stats.reading} 次阅读作答。学习日期以所选时区为准。
                    </p>
                  </section>
                  <div className="stats-detail-grid">
                    <section className="panel">
                      <h2>主题进度</h2>
                      {topics.map((t) => {
                        const total = all.filter((e) => e.topic === t).length;
                        const done = all.filter(
                          (e) => e.topic === t && state.progress[e.id],
                        ).length;
                        return (
                          <div className="topic-progress" key={t}>
                            <div>
                              <span>{t}</span>
                              <small>
                                {done} / {total}
                              </small>
                            </div>
                            <div className="progress-track">
                              <span
                                style={{
                                  width: `${total ? (done / total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </section>
                    <section className="panel">
                      <h2>接下来的复习</h2>
                      {Object.entries(state.progress).length ? (
                        <div className="upcoming-list">
                          {Object.entries(state.progress)
                            .filter(([id]) => all.some((e) => e.id === id))
                            .sort(
                              (a, b) =>
                                a[1].card.due.getTime() -
                                b[1].card.due.getTime(),
                            )
                            .slice(0, 7)
                            .map(([id, p]) => (
                              <button
                                key={id}
                                onClick={() =>
                                  setDetail(all.find((e) => e.id === id)!)
                                }
                              >
                                <span>
                                  {all.find((e) => e.id === id)?.term}
                                  <small>
                                    {p.misses
                                      ? `易错 ${p.misses} 次`
                                      : "学习中"}
                                  </small>
                                </span>
                                <span
                                  className={
                                    p.card.due.getTime() < Date.now()
                                      ? "overdue"
                                      : ""
                                  }
                                >
                                  {p.card.due.getTime() < Date.now()
                                    ? "已到期"
                                    : new Intl.DateTimeFormat("zh-CN", {
                                        timeZone: state.timezone,
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }).format(p.card.due)}
                                </span>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <div className="small-empty">
                          <CalendarDays size={30} />
                          <p>开始学习后，这里会生成复习计划。</p>
                          <button
                            className="text-button"
                            onClick={() => start()}
                          >
                            开始学习
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="panel source-progress">
                    <h2>按来源查看进度</h2>
                    {sources.map((s) => (
                      <div key={s.id}>
                        <span>{s.title}</span>
                        <strong>
                          {
                            seed.filter(
                              (e) =>
                                e.sourceId === s.id && state.progress[e.id],
                            ).length
                          }
                          <small>
                            {" "}
                            / {
                              seed.filter((e) => e.sourceId === s.id).length
                            }{" "}
                            词
                          </small>
                        </strong>
                      </div>
                    ))}
                  </section>
                  <section className="panel missed-section">
                    <div className="section-heading">
                      <h2>值得再看一次的词</h2>
                      <button
                        className="text-button"
                        onClick={() => start({ difficult: true })}
                      >
                        练习易错词
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {all
                      .filter((e) => (state.progress[e.id]?.misses || 0) > 0)
                      .sort(
                        (a, b) =>
                          state.progress[b.id].misses -
                          state.progress[a.id].misses,
                      )
                      .slice(0, 8)
                      .map((e) => (
                        <button
                          className="missed-word"
                          key={e.id}
                          onClick={() => setDetail(e)}
                        >
                          {e.term}
                          <span>{state.progress[e.id].misses} 次 Again</span>
                        </button>
                      ))}
                    {!all.some(
                      (e) => (state.progress[e.id]?.misses || 0) > 0,
                    ) && (
                      <p className="muted">
                        有 Again 记录后，易错词会出现在这里。
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Sprout size={13} /> Fieldnotes · 在每一次阅读里，生长一点。
            </span>
            <span>为环境科学研究者而作</span>
          </footer>
        </main>
      </div>
      {detail && (
        <Modal title="词汇手记" onClose={() => setDetail(null)} wide>
          <div className="detail-title">
            <div>
              <span className="topic-pill">{detail.topic}</span>
              <h2>{detail.term}</h2>
              <span className="pos">
                {detail.pos}{" "}
                {detail.abbreviation && ` · ${detail.abbreviation}`}
              </span>
            </div>
            <button
              className="icon-button"
              onClick={() => pronounce(detail.term)}
              aria-label="朗读词汇"
            >
              <Volume2 size={23} />
            </button>
            <button
              className="icon-button"
              onClick={() => favorite(detail)}
              aria-label="收藏词汇"
            >
              <Bookmark
                size={20}
                fill={state.favorites.has(detail.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
          <h3 className="detail-meaning">
            {detail.meaning || "Definition pending"}
          </h3>
          <p>{detail.explanation}</p>
          <div className="collocations">
            {detail.collocations.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="example-block">
            <span className="tiny-label">
              {detail.exampleKind === "reading"
                ? "阅读语境 · READING CONTEXT"
                : detail.exampleKind === "quotation"
                  ? "摘要原文 · SOURCE QUOTATION"
                  : "原创科研例句 · 非文献引文"}
            </span>
            <p>{detail.example}</p>
            <small>{detail.translation}</small>
          </div>
          <div className="confusion-note">
            <span>留意区别</span>
            {detail.related || "暂无补充对照词"}
          </div>
          <SourcePanel entry={detail} />
          {state.progress[detail.id] && (
            <div className="review-history">
              <h3>学习记录 · {stage(state.progress[detail.id])}</h3>
              <p>
                下次复习：
                {new Date(state.progress[detail.id].card.due).toLocaleString(
                  "zh-CN",
                  { timeZone: state.timezone },
                )}
              </p>
              {state.reviews
                .filter((e) => e.entryId === detail.id)
                .slice(-5)
                .reverse()
                .map((e) => (
                  <div key={e.id}>
                    <span>
                      {new Date(e.at).toLocaleString("zh-CN", {
                        timeZone: state.timezone,
                      })}
                    </span>
                    <strong>
                      {
                        ["", "Again", "Hard", "Good", "Easy"][
                          Number(e.payload.rating)
                        ]
                      }
                    </strong>
                  </div>
                ))}
            </div>
          )}
          <div className="modal-actions">
            {detail.verification === "personal" && (
              <>
                <button
                  className="button danger"
                  onClick={async () => {
                    if (await commit("delete", {}, detail.id)) {
                      setDetail(null);
                      setToast("个人词条已删除，学习历史保留。");
                    }
                  }}
                >
                  <Trash2 size={15} />
                  删除
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditing(detail);
                    setDetail(null);
                  }}
                >
                  <PenLine size={15} />
                  编辑
                </button>
              </>
            )}
            <button
              className="button primary"
              onClick={() => {
                setQueue([detail.id]);
                setIndex(0);
                setRevealed(false);
                setChecked(null);
                setAnswer("");
                setMode("cards");
                reviewId.current = crypto.randomUUID();
                setDetail(null);
                navigate("study");
              }}
            >
              学习这个词
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {auth && (
        <AuthModal
          userEmail={user?.email}
          avatar={state.avatar}
          onEditAvatar={() => {
            setAuth(false);
            setAvatarEditing(true);
          }}
          onClose={() => setAuth(false)}
          onImport={async () => {
            await learning.migrateGuest();
            setToast("本地记录已合并。云端状态请查看右上角。");
          }}
        />
      )}
      {avatarEditing && (
        <Modal title="设置头像" onClose={() => setAvatarEditing(false)}>
          <AvatarEditor
            key={learning.scope}
            avatar={state.avatar}
            initial={user?.email?.slice(0, 1).toUpperCase() || "R"}
            loggedIn={Boolean(user)}
            onDone={() => setAvatarEditing(false)}
            onSave={async (avatar) => {
              await save("entry", avatarPayload(avatar), avatarEntryId);
              setToast(
                user
                  ? "头像已保存到此设备，云端状态请查看右上角。"
                  : "头像已保存在此设备。",
              );
            }}
          />
        </Modal>
      )}
      {settings && (
        <Modal title="学习偏好与数据" onClose={() => setSettings(false)}>
          <div className="settings-section">
            <button
              className="profile-edit-row"
              onClick={() => {
                setSettings(false);
                setAvatarEditing(true);
              }}
            >
              <AvatarView
                avatar={state.avatar}
                initial={user?.email?.slice(0, 1).toUpperCase() || "R"}
              />
              <span>
                <strong>设置头像</strong>
                <small>上传照片或选择预设图案</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="settings-section">
            <h3>每日新词目标</h3>
            <div className="target-options">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  className={state.target === n ? "selected" : ""}
                  onClick={() => void commit("target", { value: n })}
                >
                  {n} 词
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <label htmlFor="timezone">学习时区</label>
            <select
              id="timezone"
              value={state.timezone}
              onChange={(e) =>
                void commit("timezone", { value: e.target.value })
              }
            >
              {[
                ...new Set([
                  state.timezone,
                  "Asia/Shanghai",
                  "Asia/Hong_Kong",
                  "Europe/London",
                  "Europe/Paris",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Australia/Sydney",
                  "UTC",
                ]),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <p>每日目标、活动记录与连续学习天数均按此时区计算。</p>
          </div>
          <div className="settings-section storage-info">
            <h3>
              <Cloud size={18} />
              存储与同步
            </h3>
            <p>
              {user
                ? "已登录。操作先安全写入此设备，再向你的云端账号追加事件；只有云端成功后才显示“云端已保存”。"
                : "当前为本地模式，记录保存在此浏览器的 IndexedDB 中。跨设备同步需要连接 Supabase 并登录。清除站点数据会移除未备份的本地记录。"}
            </p>
            <span className="soft-badge">
              {cloudConfigured ? "Supabase 已配置" : "Supabase 尚未连接"}
            </span>
            <p>
              离线时继续学习；联网后重试同步。失败记录不会被删除。登录前的本地记录需在账号面板中手动合并。
            </p>
          </div>
          <div className="settings-section">
            <h3>数据备份</h3>
            <div className="backup-actions">
              <button className="button secondary" onClick={exportData}>
                <Download size={16} />
                导出完整学习记录
              </button>
              <label className="button secondary import-backup">
                恢复备份
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const data = JSON.parse(await file.text());
                      if (
                        data.schemaVersion !== 1 ||
                        !Array.isArray(data.events) ||
                        data.events.length > 100000
                      )
                        throw new Error("不支持的备份格式");

                      const rows = validateBackup(
                        data.events,
                        learning.scope,
                        Boolean(user),
                      );
                      await db.transaction("rw", db.events, async () => {
                        for (const row of rows) {
                          const existing = await db.events.get(row.id);
                          if (existing && existing.scope !== learning.scope)
                            throw new Error(
                              "此备份属于其他本地空间，请登录原账号恢复。",
                            );
                          if (!existing) await db.events.add(row);
                        }
                      });
                      setToast("备份已恢复，正在重新载入。");
                      setTimeout(() => location.reload(), 600);
                    } catch (err) {
                      notifyError(err);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p>恢复相同备份会按事件 ID 去重。仅从可信的个人备份恢复。</p>
          </div>
          <div className="settings-section">
            <h3>安装为应用</h3>
            <p>
              生产部署启用 HTTPS
              后，可通过浏览器“安装应用”或“添加到主屏幕”使用。首次联网访问后缓存应用资源；开发模式不启用离线外壳。
            </p>
          </div>
        </Modal>
      )}
      {editing && (
        <EntryEditor
          entry={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (entry) => {
            if (await commit("entry", { entry }, entry.id)) {
              setEditing(null);
              setToast("个人词条已保存到此设备。");
            }
          }}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onSave={async (entry) => {
            if (await commit("entry", { entry }, entry.id)) {
              setToast("候选词已添加为未核验的个人词条。");
              return true;
            }
            return false;
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="关闭提示"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  unit,
  caption,
  color,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  unit: string;
  caption: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="stat-label">
        <Icon>{icon}</Icon>
        <span>{label}</span>
        {onClick && <ArrowUpRight size={14} />}
      </div>
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="stat-caption">
        <i className={color} />
        {caption}
      </div>
    </button>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading generic-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <div>{children}</div>
    </div>
  );
}
function SourcePanel({ entry }: { entry: Entry }) {
  const source = sources.find((s) => s.id === entry.sourceId);
  return (
    <div className="source-panel">
      <h3>
        <ShieldCheck size={17} />
        {source?.kind === "article"
          ? "自动核对摘要出现"
          : entry.verification === "verified"
            ? "已核验词源"
            : "个人提供 · 未核验"}
      </h3>
      {source ? (
        <>
          <span className="source-role">出现来源 · OCCURRENCE SOURCE</span>
          <a
            href={entrySourceLink(entry, source)}
            target="_blank"
            rel="noreferrer"
          >
            {source.title}
            <ExternalLink size={13} />
          </a>
          <p>
            {source.organization} · {source.year}
          </p>
          <small>{entry.location}</small>
          <div className="occurrence">
            <span>出现证据（短摘录）</span>
            <q>{entry.evidence}</q>
          </div>
          <span className="source-role">概念依据 · DEFINITION BASIS</span>
          <p>{entry.definitionNote}</p>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.kind === "article" ? "查看原始论文" : "同章技术描述"}
            <ExternalLink size={12} />
          </a>
          <small>
            {source.kind === "article"
              ? "核验范围：自动核对摘要中的词语出现和转载许可；未审阅全文或独立审稿。"
              : "核验范围：词语实际出现、固定版本、章节与行号。原创释义并非正式术语标准或独立学术审稿。"}
          </small>
          {source.kind === "article" && (
            <p>
              {source.authors} · {source.publishedAt}{" "}
              <a href={source.licenseUrl} target="_blank" rel="noreferrer">
                {source.license} · 转载许可
              </a>
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            {entry.exampleKind === "reading"
              ? "Personal reading word. The context is from the learning passage or question; it is not necessarily a quotation from the linked source. Definitions are learning notes, not independently verified terminology."
              : "此词条由用户提供，参考文献尚未独立核验。释义由用户填写；段落只作为学习内容处理。"}
          </p>
          {entry.exampleKind === "reading" && (
            <>
              <p>{entry.location}</p>
              <p>{entry.definitionNote}</p>
            </>
          )}
          {entry.reference &&
            (safeReference(entry.reference) ? (
              <a
                href={safeReference(entry.reference)!}
                target="_blank"
                rel="noreferrer"
              >
                {entry.reference}
                <ExternalLink size={12} />
              </a>
            ) : (
              <p>{entry.reference}</p>
            ))}
        </>
      )}
    </div>
  );
}
function AuthModal({
  userEmail,
  avatar,
  onEditAvatar,
  onClose,
  onImport,
}: {
  userEmail?: string;
  avatar: Avatar;
  onEditAvatar: () => void;
  onClose: () => void;
  onImport: () => Promise<void>;
}) {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!cloud) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const { data, error } = signup
        ? await cloud.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: location.origin },
          })
        : await cloud.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        onClose();
      } else setMessage("请查看邮箱中的验证链接。验证完成后，回到这里登录。");
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : "登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        userEmail
          ? "你的学习账号"
          : signup
            ? "创建学习账号"
            : "让积累，与你随行。"
      }
      onClose={onClose}
    >
      <button className="profile-edit-row" onClick={onEditAvatar}>
        <AvatarView
          avatar={avatar}
          initial={userEmail?.slice(0, 1).toUpperCase() || "R"}
        />
        <span>
          <strong>设置头像</strong>
          <small>上传照片或选择预设图案</small>
        </span>
        <ChevronRight size={17} />
      </button>
      {userEmail ? (
        <>
          <div className="auth-illustration">
            <Cloud size={32} />
          </div>
          <p className="auth-description">
            已登录 <strong>{userEmail}</strong>
            <br />
            账号记录与登录前的本地学习空间互相隔离。
          </p>
          <button
            className="button secondary full-width"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onImport();
                setMessage("本地记录已合并到账号，重复合并不会重复添加。");
              } catch (err) {
                setFailed(true);
                setMessage(err instanceof Error ? err.message : "合并失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            将登录前的本地记录合并到账号
          </button>
          <button
            className="button secondary full-width"
            onClick={async () => {
              if (!cloud) return;
              setBusy(true);
              const { error } = await cloud.auth.signOut();
              if (error) {
                setFailed(true);
                setMessage(error.message);
              } else onClose();
              setBusy(false);
            }}
            disabled={busy}
          >
            <LogOut size={16} />
            退出登录
          </button>
          <p className="form-hint">
            待同步记录会留在本设备的原账号空间。下次登录同一账号后继续同步。共享设备上请同时注意站点数据安全。
          </p>
        </>
      ) : (
        <>
          <div className="auth-illustration">
            <Sprout size={34} />
          </div>
          <p className="auth-description">
            在不同设备上接着学。
            <br />
            你的词汇、复习计划和学习记录，都属于你。
          </p>
          {cloudConfigured ? (
            <>
              <form onSubmit={submit} className="entry-form">
                <label>
                  邮箱
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                  />
                </label>
                <label>
                  密码
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 8 位字符"
                  />
                </label>
                <button className="button primary full-width" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : signup ? (
                    "创建账号"
                  ) : (
                    "登录并继续学习"
                  )}
                  {!busy && <ArrowRight size={16} />}
                </button>
              </form>
              <button
                className="text-button auth-toggle"
                onClick={() => {
                  setSignup(!signup);
                  setMessage("");
                }}
              >
                {signup ? "已有账号？登录" : "还没有账号？创建账号"}
              </button>
            </>
          ) : (
            <div className="cloud-not-connected">
              <CloudOff size={22} />
              <h3>云端尚未连接</h3>
              <p>
                当前可以直接在此设备学习。跨设备登录需要部署者在环境变量中配置
                Supabase，并运行项目中的数据库迁移。
              </p>
              <p>
                需要：VITE_SUPABASE_URL 与公开 anon
                key。请勿将服务器密钥填入前端。
              </p>
              <button className="button primary full-width" onClick={onClose}>
                继续本地学习
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
      {message && (
        <p
          className={`form-message ${failed ? "error" : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </Modal>
  );
}
function blankEntry(): Entry {
  return {
    id: "personal-" + crypto.randomUUID(),
    term: "",
    meaning: "",
    explanation: "",
    pos: "n. / phrase",
    collocations: [],
    example: "",
    translation: "",
    topic: "氮的形态与循环",
    difficulty: "进阶",
    related: "",
    variants: [],
    verification: "personal",
    definitionNote: "用户提供，未经独立核验。",
    reference: "",
  };
}
function EntryFields({
  entry,
  setEntry,
}: {
  entry: Entry;
  setEntry: (value: Entry) => void;
}) {
  const field = (key: keyof Entry, value: unknown) =>
    setEntry({
      ...entry,
      [key]: value,
      ...(key === "meaning" &&
      entry.exampleKind === "reading" &&
      entry.explanation === entry.meaning
        ? { explanation: String(value) }
        : {}),
    });
  return (
    <>
      <div className="form-columns">
        <label>
          英文单词或短语 <span>*</span>
          <input
            required
            maxLength={150}
            value={entry.term}
            onChange={(e) => field("term", e.target.value)}
            placeholder="e.g. nitrogen use efficiency"
          />
        </label>
        <label>
          {entry.contentLanguage === "en" ? "English definition" : "中文含义"}{" "}
          <span>*</span>
          <input
            required
            maxLength={200}
            value={entry.meaning}
            onChange={(e) => field("meaning", e.target.value)}
            placeholder="填写你确认的中文含义"
          />
        </label>
      </div>
      <label>
        {entry.contentLanguage === "en" ? "Concept explanation" : "概念解释"}{" "}
        <span>*</span>
        <textarea
          required
          maxLength={3000}
          value={entry.explanation}
          onChange={(e) => field("explanation", e.target.value)}
          placeholder="用自己的话解释科学概念，注明不确定之处。"
          rows={3}
        />
      </label>
      <div className="form-columns">
        <label>
          主题
          <select
            value={entry.topic}
            onChange={(e) => field("topic", e.target.value)}
          >
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select
            value={entry.difficulty}
            onChange={(e) => field("difficulty", e.target.value)}
          >
            {["基础", "进阶", "深入"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-columns">
        <label>
          词性
          <input
            value={entry.pos}
            maxLength={50}
            onChange={(e) => field("pos", e.target.value)}
            placeholder="n. / phrase"
          />
        </label>
        <label>
          缩写
          <input
            value={entry.abbreviation || ""}
            maxLength={50}
            onChange={(e) => field("abbreviation", e.target.value)}
            placeholder="可选，如 NUE"
          />
        </label>
      </div>
      <label>
        常见搭配（用分号分隔）
        <input
          value={entry.collocations.join(";")}
          maxLength={500}
          onChange={(e) => field("collocations", e.target.value.split(/[;；]/))}
          placeholder="improve nitrogen use efficiency;crop nitrogen use efficiency"
        />
      </label>
      <label>
        {entry.exampleKind === "reading" ? "Reading context" : "原创英文例句"}
        <input
          value={entry.example}
          maxLength={2000}
          onChange={(e) => field("example", e.target.value)}
          placeholder="填写自己的例句，不要将文献原句标为原创。"
        />
      </label>
      <label>
        例句中文翻译
        <input
          value={entry.translation}
          maxLength={2000}
          onChange={(e) => field("translation", e.target.value)}
        />
      </label>
      <label>
        相关或易混淆词
        <input
          value={entry.related}
          maxLength={1000}
          onChange={(e) => field("related", e.target.value)}
        />
      </label>
      <label>
        拼写可接受变体（用分号分隔）
        <input
          value={entry.variants.join(";")}
          maxLength={500}
          onChange={(e) => field("variants", e.target.value.split(/[;；]/))}
          placeholder="仅填写确实等价的答案"
        />
      </label>
      <label>
        DOI、官方 URL 或文献信息
        <input
          value={entry.reference || ""}
          maxLength={2000}
          onChange={(e) => field("reference", e.target.value)}
          placeholder="https://doi.org/… 或完整文献信息"
        />
      </label>
      <p className="form-hint">
        <ShieldCheck size={14} />
        个人词条始终标为“用户提供 · 未核验”，附上链接不会自动完成来源核验。
      </p>
    </>
  );
}
function cleanEntry(entry: Entry): Entry {
  const reference = entry.reference?.trim();
  return {
    ...entry,
    term: entry.term.trim(),
    meaning: entry.meaning.trim(),
    explanation: entry.explanation.trim(),
    collocations: entry.collocations.map((t) => t.trim()).filter(Boolean),
    variants: entry.variants.map((t) => t.trim()).filter(Boolean),
    reference:
      reference && /^10\.\d{4,9}\//.test(reference)
        ? "https://doi.org/" + reference
        : reference,
    verification: "personal",
    ...(entry.exampleKind === "reading" && entry.meaning.trim()
      ? {
          definitionNote:
            "Personal English definition; not independently verified.",
        }
      : {}),
  };
}
function EntryEditor({
  entry: existing,
  onClose,
  onSave,
}: {
  entry?: Entry;
  onClose: () => void;
  onSave: (entry: Entry) => Promise<void>;
}) {
  const [entry, setEntry] = useState<Entry>(() => existing || blankEntry()),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={existing ? "编辑个人词条" : "添加研究词汇"}
      onClose={onClose}
      wide
    >
      <form
        className="entry-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            busy ||
            !entry.term.trim() ||
            !entry.meaning.trim() ||
            !entry.explanation.trim()
          )
            return;
          setBusy(true);
          try {
            await onSave(cleanEntry(entry));
          } finally {
            setBusy(false);
          }
        }}
      >
        <EntryFields entry={entry} setEntry={setEntry} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            保存词条
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (entry: Entry) => Promise<boolean>;
}) {
  const [passage, setPassage] = useState(""),
    [reference, setReference] = useState(""),
    [candidates, setCandidates] = useState<{ term: string; match?: Entry }[]>(
      [],
    ),
    [draft, setDraft] = useState<Entry | null>(null),
    [added, setAdded] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [extracted, setExtracted] = useState(false);
  const extract = () => {
    const text = passage.toLowerCase();
    const matched = seed.filter((e) =>
      new RegExp(
        "\\b" + e.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
        "i",
      ).test(text),
    );
    const stop = new Set(
      "about above after again against among because before being between could during every first found further given however including might other paper research results should shown study studies their there these those through under using where which while within without would based important therefore".split(
        " ",
      ),
    );
    const tokens = [
      ...new Set(passage.match(/[A-Za-z][A-Za-z-]{4,}/g) || []),
    ].filter(
      (w) =>
        !stop.has(w.toLowerCase()) &&
        !matched.some((e) => e.term.toLowerCase().includes(w.toLowerCase())),
    );
    setCandidates(
      [
        ...matched.map((e) => ({ term: e.term, match: e })),
        ...tokens.slice(0, 10).map((term) => ({ term })),
      ].slice(0, 24),
    );
    setExtracted(true);
  };
  return (
    <Modal title="从论文段落中，发现新词" onClose={onClose} wide>
      {draft ? (
        <form
          className="entry-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              busy ||
              !draft.term.trim() ||
              !draft.meaning.trim() ||
              !draft.explanation.trim()
            )
              return;
            setBusy(true);
            try {
              if (await onSave(cleanEntry(draft))) {
                setAdded((v) => [...v, draft.term]);
                setDraft(null);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <button
            type="button"
            className="text-button"
            onClick={() => setDraft(null)}
          >
            <ArrowLeft size={14} />
            返回候选词
          </button>
          <div className="import-note">
            请检查并确认含义后再添加。引用段落和参考信息均为用户提供，未进行来源核验。
          </div>
          <EntryFields entry={draft} setEntry={setDraft} />
          <div className="modal-actions">
            <button className="button primary" disabled={busy}>
              <Plus size={16} />
              确认并添加
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">
            粘贴摘要或正文，用词库匹配和简单词形规则发现候选词。无需模型
            API；不会凭空生成定义。
          </p>
          <div className="entry-form">
            <label>
              论文段落
              <textarea
                rows={6}
                maxLength={20000}
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="Paste an abstract or a passage from your paper…"
              />
            </label>
            <label>
              参考文献 / DOI / 官方链接
              <input
                value={reference}
                maxLength={2000}
                onChange={(e) => setReference(e.target.value)}
                placeholder="可选；附上参考信息不代表已核验"
              />
            </label>
            <button
              className="button primary"
              disabled={!passage.trim()}
              onClick={extract}
            >
              <Search size={16} />
              识别候选词
            </button>
          </div>
          {extracted && (
            <div className="candidates">
              <h3>
                {candidates.length} 个候选词 <small>点击检查后添加</small>
              </h3>
              {candidates.length ? (
                candidates.map((c) => (
                  <button
                    key={c.term}
                    disabled={added.includes(c.term)}
                    onClick={() =>
                      setDraft({
                        ...blankEntry(),
                        term: c.term,
                        reference,
                        ...(c.match
                          ? {
                              meaning: c.match.meaning,
                              explanation: c.match.explanation,
                              topic: c.match.topic,
                              collocations: c.match.collocations,
                              example: c.match.example,
                              translation: c.match.translation,
                              related: c.match.related,
                            }
                          : {}),
                        definitionNote: c.match
                          ? "释义参考本站词库；本段落来源未经独立核验。"
                          : "用户填写释义，未经独立核验。",
                      })
                    }
                  >
                    <span>
                      {c.term}
                      <small>
                        {added.includes(c.term)
                          ? "已添加"
                          : c.match
                            ? "有词库释义可供检查"
                            : "请手动填写并确认释义"}
                      </small>
                    </span>
                    {added.includes(c.term) ? (
                      <Check size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                ))
              ) : (
                <p>
                  未识别到候选词。可手动创建词条；此工具不推断专业术语的含义。
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
