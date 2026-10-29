import vocabulary from "./vocabulary.json";
import references from "./sources.json";
import type { Entry, Source } from "../lib/model";
import dailyData from "./daily-literature.json";

import readingData from "./readings.json";
import type { ReadingLesson } from "../lib/reading";
export interface DailyArticle {
  pmcid: string;
  title: string;
  publishedAt: string;
  addedAt: string;
  source: Source;
  lesson: ReadingLesson;
}
export interface DailyCatalog {
  schemaVersion: number;
  lastCheckedAt: string | null;
  lastAddedAt: string | null;
  articles: DailyArticle[];
  vocabulary: Entry[];
}
export const dailyLiterature = dailyData as DailyCatalog;
export const seed = [...(vocabulary as Entry[]), ...dailyLiterature.vocabulary];
export const sources = [
  ...(references as Source[]),
  ...dailyLiterature.articles.map((article) => article.source),
];
// Keep the established lessons first so their ordering and saved IDs stay stable.
export const readings = [
  ...(readingData as ReadingLesson[]),
  ...dailyLiterature.articles.map((article) => article.lesson),
];
