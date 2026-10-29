import type { DailyCatalog } from "../data";
import { dayKey } from "./model";

export function literatureStatus(data: DailyCatalog, now = new Date()) {
  const today = dayKey(now, "Asia/Shanghai");
  const todayArticles = data.articles.filter(
    (article) => dayKey(article.addedAt, "Asia/Shanghai") === today,
  );
  const sources = new Set(todayArticles.map((article) => article.source.id));
  return {
    checkedToday: Boolean(
      data.lastCheckedAt &&
      dayKey(data.lastCheckedAt, "Asia/Shanghai") === today,
    ),
    articlesAddedToday: todayArticles.length,
    vocabularyAddedToday: data.vocabulary.filter((word) =>
      sources.has(word.sourceId || ""),
    ).length,
  };
}
