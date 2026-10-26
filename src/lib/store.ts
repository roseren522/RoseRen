import Dexie, { type Table } from "dexie";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type LearningEvent } from "./model";
import { validateBackup } from "./import";
export interface ReadingDraft {
  scope: string;
  key: string;
  answer: string;
  updatedAt: string;
}
export class LearningDB extends Dexie {
  events!: Table<LearningEvent, string>;
  drafts!: Table<ReadingDraft, [string, string]>;
  constructor(name = "fieldnotes-v1") {
    super(name);
    this.version(1).stores({ events: "id, scope, [scope+synced]" });
    this.version(2).stores({
      events: "id, scope, [scope+synced]",
      drafts: "[scope+key], scope",
    });
  }
}
export const db = new LearningDB();
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const cloudConfigured = Boolean(url && key);
export const cloud: SupabaseClient | null = cloudConfigured
  ? createClient(url, key)
  : null;
export async function persist(event: LearningEvent, database = db) {
  await database.transaction("rw", database.events, async () => {
    if (!(await database.events.get(event.id)))
      await database.events.add(event);
  });
}
export interface Transport {
  upload: (rows: LearningEvent[]) => Promise<void>;
  download: () => Promise<Omit<LearningEvent, "scope" | "synced">[]>;
}
export async function synchronize(
  scope: string,
  transport: Transport,
  database = db,
) {
  const pending = await database.events
    .where("[scope+synced]")
    .equals([scope, 0])
    .toArray();
  if (pending.length) {
    await transport.upload(pending);
    await database.transaction("rw", database.events, async () => {
      for (const row of pending)
        await database.events.update(row.id, { synced: 1 });
    });
  }
  const remote = validateBackup(await transport.download(), scope, true);
  await database.transaction("rw", database.events, async () => {
    for (const row of remote) {
      const local = await database.events.get(row.id);
      if (local && local.scope !== scope) throw new Error("事件账户不匹配");
      await database.events.put({ ...row, scope, synced: 1 });
    }
  });
}
export function supabaseTransport(userId: string): Transport {
  if (!cloud) throw new Error("云端尚未配置");
  return {
    async upload(rows) {
      const { error } = await cloud!.from("learning_events").upsert(
        rows.map(({ id, kind, at, entryId, payload }) => ({
          id,
          user_id: userId,
          kind,
          occurred_at: at,
          entry_id: entryId || null,
          payload,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    async download() {
      const all: Omit<LearningEvent, "scope" | "synced">[] = [];
      let start = 0;
      while (true) {
        const { data, error } = await cloud!
          .from("learning_events")
          .select("id,kind,occurred_at,entry_id,payload")
          .eq("user_id", userId)
          .order("occurred_at")
          .order("id")
          .range(start, start + 999);
        if (error) throw error;
        for (const row of data || [])
          all.push({
            id: row.id,
            kind: row.kind,
            at: row.occurred_at,
            entryId: row.entry_id || undefined,
            payload: row.payload,
          });
        if ((data || []).length < 1000) break;
        start += 1000;
      }
      return all;
    },
  };
}
