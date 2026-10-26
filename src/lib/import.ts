import { topics, type Entry, type LearningEvent } from "./model";
const string = (value: unknown, max = 20000): value is string =>
  typeof value === "string" && value.length <= max;
export function validateBackup(
  input: unknown[],
  scope: string,
  cloud: boolean,
): LearningEvent[] {
  const uuids = new Set<string>();
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("备份记录无效");
    const e = item as LearningEvent;
    if (
      !string(e.id, 40) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        e.id,
      ) ||
      uuids.has(e.id)
    )
      throw new Error("事件 ID 无效或重复");
    uuids.add(e.id);
    if (
      !string(e.at, 50) ||
      !Number.isFinite(Date.parse(e.at)) ||
      !["review", "favorite", "target", "timezone", "entry", "delete"].includes(
        e.kind,
      ) ||
      !e.payload ||
      typeof e.payload !== "object"
    )
      throw new Error("事件数据无效");
    if (e.entryId !== undefined && !string(e.entryId, 100))
      throw new Error("词条标识无效");
    if (
      e.kind === "review" &&
      (!e.entryId || ![1, 2, 3, 4].includes(Number(e.payload.rating)))
    )
      throw new Error("评价无效");
    if (e.kind === "favorite" && typeof e.payload.value !== "boolean")
      throw new Error("收藏记录无效");
    if (
      e.kind === "target" &&
      ![5, 10, 15, 20].includes(Number(e.payload.value))
    )
      throw new Error("目标无效");
    if (e.kind === "timezone") {
      if (!string(e.payload.value, 100)) throw new Error("时区无效");
      try {
        new Intl.DateTimeFormat("en", { timeZone: e.payload.value }).format();
      } catch {
        throw new Error("时区无效");
      }
    }
    if (e.kind === "entry") {
      const word = e.payload.entry as Entry;
      if (
        !word ||
        word.id !== e.entryId ||
        !word.id.startsWith("personal-") ||
        !topics.includes(word.topic) ||
        !["基础", "进阶", "深入"].includes(word.difficulty)
      )
        throw new Error("个人词条无效");
      for (const key of [
        "term",
        "meaning",
        "explanation",
        "pos",
        "example",
        "translation",
        "related",
        "definitionNote",
      ] as const)
        if (!string(word[key])) throw new Error("个人词条字段无效");
      for (const key of ["collocations", "variants"] as const)
        if (
          !Array.isArray(word[key]) ||
          word[key].length > 100 ||
          !word[key].every((v) => string(v, 1000))
        )
          throw new Error("词条搭配或变体无效");
      if (word.abbreviation !== undefined && !string(word.abbreviation, 50))
        throw new Error("词条缩写无效");
      if (word.reference !== undefined && !string(word.reference, 2000))
        throw new Error("参考信息无效");
      e.payload = {
        entry: { ...word, verification: "personal", sourceId: undefined },
      };
    }
    return {
      ...e,
      scope,
      at: new Date(e.at).toISOString(),
      synced: cloud ? 0 : 1,
    };
  });
}
