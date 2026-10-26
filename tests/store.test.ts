import { afterEach, describe, expect, it } from "vitest";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";
import { project, type LearningEvent } from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
const databases: LearningDB[] = [];
function database() {
  const d = new LearningDB("test-" + crypto.randomUUID());
  databases.push(d);
  return d;
}
const event = (scope = "alice"): LearningEvent => ({
  id: crypto.randomUUID(),
  scope,
  kind: "review",
  at: "2026-10-20T00:00:00Z",
  entryId: "v001",
  payload: { rating: 3 },
  synced: 0,
});
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
it("persists and deduplicates across separate database sessions", async () => {
  const first = database(),
    row = event();
  await Promise.all([persist(row, first), persist(row, first)]);
  expect(await first.events.count()).toBe(1);
  const name = first.name;
  first.close();
  const second = new LearningDB(name);
  databases.push(second);
  expect((await second.events.get(row.id))?.payload.rating).toBe(3);
});
it("keeps failed writes recoverable, retries idempotently, and restores to another device", async () => {
  const first = database(),
    second = database(),
    row = event();
  await persist(row, first);
  const remote = new Map<string, LearningEvent>();
  let fail = true;
  const transport: Transport = {
    async upload(rows) {
      for (const r of rows) remote.set(r.id, r);
      if (fail) throw new Error("connection lost after commit");
    },
    async download() {
      return [...remote.values()];
    },
  };
  await expect(synchronize("alice", transport, first)).rejects.toThrow(
    "connection lost",
  );
  expect((await first.events.get(row.id))?.synced).toBe(0);
  fail = false;
  await synchronize("alice", transport, first);
  await synchronize("alice", transport, second);
  expect(remote.size).toBe(1);
  expect((await first.events.get(row.id))?.synced).toBe(1);
  expect(project(await second.events.toArray()).progress.v001.reviews).toBe(1);
});
it("merges concurrent offline reviews without dropping newer progress and isolates accounts", async () => {
  const a = database(),
    b = database(),
    old = event(),
    newer = { ...event(), at: "2026-10-21T00:00:00Z", payload: { rating: 4 } },
    bob = event("bob");
  await persist(old, a);
  await persist(newer, b);
  await persist(bob, a);
  const remote = new Map<string, LearningEvent>();
  const transport: Transport = {
    async upload(rows) {
      for (const r of rows) {
        expect(r.scope).toBe("alice");
        remote.set(r.id, r);
      }
    },
    async download() {
      return [...remote.values()];
    },
  };
  await synchronize("alice", transport, b);
  await synchronize("alice", transport, a);
  await synchronize("alice", transport, b);
  const aliceA = await a.events.where("scope").equals("alice").toArray(),
    aliceB = await b.events.where("scope").equals("alice").toArray();
  expect(project(aliceA).progress).toEqual(project(aliceB).progress);
  expect(project(aliceA).progress.v001.reviews).toBe(2);
  expect((await a.events.get(bob.id))?.synced).toBe(0);
});
it("does not mark actions arriving during sync as remotely saved", async () => {
  const d = database(),
    first = event(),
    second = event();
  await persist(first, d);
  const transport: Transport = {
    async upload() {
      await persist(second, d);
    },
    async download() {
      return [];
    },
  };
  await synchronize("alice", transport, d);
  expect((await d.events.get(first.id))?.synced).toBe(1);
  expect((await d.events.get(second.id))?.synced).toBe(0);
});
describe("backup recovery", () => {
  it("validates before recovery and resets cloud acknowledgement", () => {
    const row = event();
    const restored = validateBackup([{ ...row, synced: 1 }], "alice", true);
    expect(restored[0].synced).toBe(0);
    expect(restored[0].id).toBe(row.id);
  });
  it("rejects malformed records and fabricated ratings", () => {
    expect(() =>
      validateBackup([{ ...event(), payload: { rating: 9 } }], "alice", true),
    ).toThrow();
    expect(() =>
      validateBackup([{ ...event(), kind: "hack" }], "alice", true),
    ).toThrow();
  });
});
