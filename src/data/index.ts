import vocabulary from "./vocabulary.json";
import references from "./sources.json";
import type { Entry, Source } from "../lib/model";
export const seed = vocabulary as Entry[];
export const sources = references as Source[];

import readingData from "./readings.json";
import type { ReadingLesson } from "../lib/reading";
export const readings = readingData as ReadingLesson[];
