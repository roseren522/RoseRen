import { createEmptyCard, fsrs, State, type Card, type Grade } from "ts-fsrs";
export type Topic =
  | "氮的形态与循环"
  | "农业与土壤"
  | "排放与跨介质过程"
  | "清单与系统边界"
  | "数据与空间方法"
  | "不确定性与研究方法"
  | "学术表达";
export const topics: Topic[] = [
  "氮的形态与循环",
  "农业与土壤",
  "排放与跨介质过程",
  "清单与系统边界",
  "数据与空间方法",
  "不确定性与研究方法",
  "学术表达",
];
export interface Source {
  id: string;
  title: string;
  organization: string;
  year: string;
  url: string;
  scope: string;
  evidence: string;
  revision: string;
}
export interface Entry {
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  pos: string;
  abbreviation?: string;
  collocations: string[];
  example: string;
  translation: string;
  topic: Topic;
  difficulty: "基础" | "进阶" | "深入";
  related: string;
  variants: string[];
  verification: "verified" | "personal";
  sourceId?: string;
  location?: string;
  evidence?: string;
  reference?: string;
  definitionNote: string;
}
export type EventKind =
  "review" | "favorite" | "target" | "timezone" | "entry" | "delete";
export interface LearningEvent {
  id: string;
  scope: string;
  kind: EventKind;
  at: string;
  entryId?: string;
  payload: Record<string, unknown>;
  synced: number;
}
export interface Progress {
  card: Card;
  reviews: number;
  misses: number;
}
export interface Projection {
  progress: Record<string, Progress>;
  favorites: Set<string>;
  entries: Record<string, Entry>;
  deleted: Set<string>;
  target: number;
  timezone: string;
  reviews: LearningEvent[];
}
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export function project(events: LearningEvent[]): Projection {
  const result: Projection = {
    progress: {},
    favorites: new Set(),
    entries: {},
    deleted: new Set(),
    target: 10,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    reviews: [],
  };
  const unique = [
    ...new Map(events.map((event) => [event.id, event])).values(),
  ].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
  for (const event of unique) {
    const id = event.entryId || "";
    if (event.kind === "review") {
      const rating = Number(event.payload.rating);
      if (
        ![1, 2, 3, 4].includes(rating) ||
        !id ||
        !Number.isFinite(Date.parse(event.at))
      )
        continue;
      const previous = result.progress[id];
      const time = new Date(event.at);
      const next = scheduler.next(
        previous?.card || createEmptyCard(time),
        time,
        rating as Grade,
      );
      result.progress[id] = {
        card: next.card,
        reviews: (previous?.reviews || 0) + 1,
        misses: (previous?.misses || 0) + (rating === 1 ? 1 : 0),
      };
      result.reviews.push(event);
    } else if (event.kind === "favorite") {
      if (event.payload.value) result.favorites.add(id);
      else result.favorites.delete(id);
    } else if (
      event.kind === "target" &&
      [5, 10, 15, 20].includes(Number(event.payload.value))
    )
      result.target = Number(event.payload.value);
    else if (
      event.kind === "timezone" &&
      typeof event.payload.value === "string"
    ) {
      try {
        new Intl.DateTimeFormat("en", {
          timeZone: event.payload.value,
        }).format();
        result.timezone = event.payload.value;
      } catch {
        /* preserve last valid zone */
      }
    } else if (event.kind === "entry") {
      const entry = event.payload.entry as Entry;
      if (entry?.id === id) {
        result.entries[id] = { ...entry, verification: "personal" };
        result.deleted.delete(id);
      }
    } else if (event.kind === "delete") result.deleted.add(id);
  }
  return result;
}
export function dayKey(date: Date | string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function dayBefore(key: string) {
  const date = new Date(key + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function statistics(state: Projection, now = new Date()) {
  const today = dayKey(now, state.timezone);
  const first: Record<string, string> = {};
  for (const event of state.reviews)
    if (event.entryId && !first[event.entryId]) first[event.entryId] = event.id;
  const todays = state.reviews.filter(
    (event) => dayKey(event.at, state.timezone) === today,
  );
  const fresh = todays.filter(
    (event) => first[event.entryId!] === event.id,
  ).length;
  const days = new Set(
    state.reviews.map((event) => dayKey(event.at, state.timezone)),
  );
  let current = days.has(today) ? today : dayBefore(today),
    streak = 0;
  while (days.has(current)) {
    streak++;
    current = dayBefore(current);
  }
  return {
    today,
    fresh,
    reviews: todays.length - fresh,
    total: todays.length,
    streak,
    days,
    learned: Object.keys(state.progress).length,
    retained: Object.values(state.progress).filter(
      (w) =>
        w.card.state === State.Review &&
        w.card.stability >= 21 &&
        w.reviews >= 3,
    ).length,
  };
}
export function normalizeAnswer(input: string) {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}
export function acceptsAnswer(entry: Entry, answer: string) {
  return [entry.term, ...entry.variants].some(
    (term) => normalizeAnswer(term) === normalizeAnswer(answer),
  );
}
export function stage(progress?: Progress) {
  return !progress
    ? "未学习"
    : progress.card.state === State.Review &&
        progress.card.stability >= 21 &&
        progress.reviews >= 3
      ? "长期保持"
      : "学习中";
}
export function safeReference(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function makeChoices(entry: Entry, all: Entry[]) {
  const others = [
    ...new Map(
      all
        .filter((e) => e.id !== entry.id && e.meaning !== entry.meaning)
        .map((e) => [e.meaning, e]),
    ).values(),
  ];
  others.sort(
    (a, b) =>
      Number(b.topic === entry.topic) - Number(a.topic === entry.topic) ||
      a.id.localeCompare(b.id),
  );
  const answers = [entry, ...others.slice(0, 3)];
  // Stable per entry: rerenders never move an answer under the pointer.
  return answers.sort((a, b) => hash(a.id + entry.id) - hash(b.id + entry.id));
}
function hash(text: string) {
  let value = 0;
  for (const c of text) value = (value * 31 + c.charCodeAt(0)) >>> 0;
  return value;
}

export function recentDays(today: string, count = 28) {
  const days = [today];
  while (days.length < count) days.push(dayBefore(days[days.length - 1]));
  return days.reverse();
}
