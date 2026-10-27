import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { db } from "../src/lib/store";
import { useLearning } from "../src/lib/useLearning";
import { readings } from "../src/data";
import type { LearningEvent } from "../src/lib/model";

const auth = vi.hoisted(() => ({
  failSync: false,
  user: { id: "alice", email: "alice@example.org" },
  callbacks: [] as ((
    event: string,
    session: { user: { id: string; email: string } },
  ) => void)[],
}));
vi.mock("../src/lib/store", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/store")>(
      "../src/lib/store",
    );
  return {
    ...actual,
    cloud: {
      auth: {
        async getSession() {
          return { data: { session: { user: auth.user } }, error: null };
        },
        onAuthStateChange(callback: (typeof auth.callbacks)[number]) {
          auth.callbacks.push(callback);
          return {
            data: {
              subscription: {
                unsubscribe() {
                  auth.callbacks = auth.callbacks.filter((c) => c !== callback);
                },
              },
            },
          };
        },
      },
    },
    synchronize: async () => {
      if (auth.failSync) throw new Error("Initial history fetch failed");
    },
    supabaseTransport: () => ({}),
  };
});

function completed(scope: string): LearningEvent[] {
  return readings[0].questions.map((q, i) => ({
    id: crypto.randomUUID(),
    scope,
    kind: "review",
    at: `2026-10-27T01:00:0${i}Z`,
    entryId: `reading:${readings[0].id}:${q.id}`,
    payload: {
      activity: "reading",
      version: 1,
      lessonId: readings[0].id,
      questionId: q.id,
      questionType: q.type,
      answer: q.type === "choice" ? q.correct! : "Previously saved explanation",
      rating: 3,
      assessment: q.type === "choice" ? "objective" : "self",
    },
    synced: scope === "guest" ? 1 : 0,
  }));
}
afterEach(async () => {
  cleanup();
  await db.events.clear();
  localStorage.clear();
  auth.callbacks = [];
  auth.failSync = false;
});

it("a refreshed login session for the same account never clears completed reading records or remounts the reading screen", async () => {
  await db.events.bulkPut(completed("alice"));
  const renders: { loading: boolean; count: number }[] = [];
  const { result } = renderHook(() => {
    const learning = useLearning();
    renders.push({
      loading: learning.loading,
      count: learning.state.readingReviews.length,
    });
    return learning;
  });
  await waitFor(() =>
    expect(result.current.state.readingReviews).toHaveLength(3),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  renders.length = 0;
  await act(async () => {
    for (const callback of auth.callbacks)
      callback("TOKEN_REFRESHED", { user: { ...auth.user } });
  });
  expect(renders.length).toBeGreaterThan(0);
  expect(renders.every((row) => !row.loading && row.count === 3)).toBe(true);
});

it("detects pre-login reading records and keeps them after an explicit idempotent merge", async () => {
  await db.events.bulkPut(completed("guest"));
  const { result } = renderHook(() => useLearning());
  await waitFor(() => expect(result.current.unmergedReadingCount).toBe(3));
  await act(async () => {
    await result.current.migrateGuest();
  });
  await waitFor(() => expect(result.current.unmergedReadingCount).toBe(0));
  expect(result.current.state.readingReviews).toHaveLength(3);
  await act(async () => {
    await result.current.migrateGuest();
  });
  expect(result.current.state.readingReviews).toHaveLength(3);
  expect(await db.events.where("scope").equals("guest").count()).toBe(3);
});

it("does not treat a failed initial cloud restore as a confirmed empty learning history", async () => {
  auth.failSync = true;
  const { result } = renderHook(() => useLearning());
  await waitFor(() => expect(result.current.status).toBe("failed"));
  expect(result.current.hasCloudSnapshot).toBe(false);
  auth.failSync = false;
  await act(async () => {
    await result.current.sync();
  });
  await waitFor(() => expect(result.current.hasCloudSnapshot).toBe(true));
});
