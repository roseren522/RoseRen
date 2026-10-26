import vocabulary from "./vocabulary.json";
import references from "./sources.json";
import type { Entry, Source } from "../lib/model";
export const seed = vocabulary as Entry[];
export const sources = references as Source[];
