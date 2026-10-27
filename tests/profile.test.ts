import { describe, expect, it } from "vitest";
import {
  avatarEntryId,
  avatarPayload,
  maxAvatarLength,
  validAvatar,
} from "../src/lib/profile";
import { project, statistics, type LearningEvent } from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";

const event = (
  avatar: Parameters<typeof avatarPayload>[0],
  at = "2026-10-27T02:00:00Z",
): LearningEvent => ({
  id: crypto.randomUUID(),
  scope: "alice",
  kind: "entry",
  at,
  entryId: avatarEntryId,
  payload: avatarPayload(avatar),
  synced: 0,
});
describe("account avatar records", () => {
  it("replays latest changes and removal without affecting vocabulary or learning statistics", () => {
    const first = event({ type: "preset", id: "leaf" });
    const second = event(
      { type: "preset", id: "waves" },
      "2026-10-27T03:00:00Z",
    );
    const state = project([second, first, second]);
    expect(state.avatar).toEqual({ type: "preset", id: "waves" });
    expect(state.entries).toEqual({});
    expect(state.reviews).toHaveLength(0);
    expect(state.readingReviews).toHaveLength(0);
    expect(statistics(state, new Date(second.at)).streak).toBe(0);
    expect(
      project([first, second, event(null, "2026-10-27T04:00:00Z")]).avatar,
    ).toBeNull();
  });
  it("rejects external URLs, executable formats, oversized data and wrong reserved identifiers in restores", () => {
    for (const avatar of [
      undefined,
      { type: "preset", id: "unknown" },
      { type: "image", dataUrl: "https://example.org/avatar.jpg" },
      { type: "image", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
      {
        type: "image",
        dataUrl: "data:image/jpeg;base64,/9j/" + "A".repeat(maxAvatarLength),
      },
    ])
      expect(validAvatar(avatar)).toBe(false);
    const row = event({ type: "preset", id: "sprout" });
    expect(() =>
      validateBackup([{ ...row, entryId: "personal-fake" }], "alice", true),
    ).toThrow("头像记录无效");
    expect(() =>
      validateBackup(
        [{ ...row, payload: { ...row.payload, version: 2 } }],
        "alice",
        true,
      ),
    ).toThrow("头像记录无效");
    const restored = validateBackup([row], "alice", true);
    expect(project(restored).avatar).toEqual(row.payload.avatar);
    expect(restored[0].synced).toBe(0);
  });
  it("preserves the last valid avatar when replaying malformed data", () => {
    const row = event({ type: "preset", id: "book" });
    const bad = {
      ...row,
      id: crypto.randomUUID(),
      at: "2026-10-27T05:00:00Z",
      payload: {
        activity: "profile",
        version: 1,
        avatar: { type: "preset", id: "unknown" },
      },
    };
    expect(project([row, bad]).avatar).toEqual({ type: "preset", id: "book" });
  });
  it("syncs to a second device, retries failures and keeps account spaces isolated", async () => {
    const a = new LearningDB("avatar-a-" + crypto.randomUUID()),
      b = new LearningDB("avatar-b-" + crypto.randomUUID());
    try {
      const row = event({ type: "preset", id: "atom" });
      const bob = { ...event({ type: "preset", id: "sun" }), scope: "bob" };
      await persist(row, a);
      await persist(bob, a);
      const server = new Map<string, LearningEvent>();
      let fail = true;
      const transport: Transport = {
        async upload(rows) {
          for (const item of rows) {
            expect(item.scope).toBe("alice");
            server.set(item.id, item);
          }
          if (fail) throw new Error("network failure after upload");
        },
        async download() {
          return [...server.values()];
        },
      };
      await expect(synchronize("alice", transport, a)).rejects.toThrow();
      expect((await a.events.get(row.id))?.synced).toBe(0);
      fail = false;
      await synchronize("alice", transport, a);
      await synchronize("alice", transport, b);
      expect(server.size).toBe(1);
      expect(
        project(await b.events.where("scope").equals("alice").toArray()).avatar,
      ).toEqual(row.payload.avatar);
      expect(await b.events.where("scope").equals("bob").count()).toBe(0);
      expect(
        project(await a.events.where("scope").equals("bob").toArray()).avatar,
      ).toEqual(bob.payload.avatar);
    } finally {
      await a.delete();
      await b.delete();
    }
  });
});
