import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloud, db, persist, synchronize, supabaseTransport } from "./store";
import { project, type LearningEvent, type EventKind } from "./model";
export function useLearning() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!cloud);
  const [events, setEvents] = useState<LearningEvent[]>([]),
    [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    "local" | "saved" | "pending" | "failed" | "syncing"
  >("local");
  const [error, setError] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const scope = user?.id || "guest";
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const rows = await db.events.where("scope").equals(scope).toArray();
    if (activeScope.current === scope) setEvents(rows);
    return rows;
  }, [scope]);
  const sync = useCallback(async () => {
    if (!user || !navigator.onLine || lock.current) return;
    lock.current = true;
    setStatus("syncing");
    try {
      await synchronize(user.id, supabaseTransport(user.id));
      if (activeScope.current === user.id) {
        const rows = await refresh();
        setStatus(rows.some((row) => !row.synced) ? "pending" : "saved");
        setError("");
      }
    } catch (err) {
      if (activeScope.current === user.id) {
        setStatus("failed");
        setError(
          err instanceof Error ? err.message : "同步失败，记录保留在此设备。",
        );
      }
    } finally {
      lock.current = false;
    }
  }, [user, refresh]);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    cloud.auth
      .getSession()
      .then(({ data, error }) => {
        if (live) {
          setUser(data.session?.user || null);
          setAuthReady(true);
          if (error) setError(error.message);
        }
      })
      .catch(() => {
        if (live) {
          setAuthReady(true);
          setError("无法恢复登录，请重试。");
        }
      });
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthReady(true);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    setLoading(true);
    setEvents([]);
    setStatus(user ? "pending" : "local");
    refresh()
      .then(() => {
        if (activeScope.current === scope) setLoading(false);
      })
      .catch(() => {
        setError(
          "本地存储不可用。请允许站点存储后重试，当前操作不会被标为已保存。",
        );
        setLoading(false);
      });
  }, [scope, refresh, user]);
  useEffect(() => {
    const up = () => {
        setOnline(true);
        void sync();
      },
      down = () => {
        setOnline(false);
        if (user) setStatus("pending");
      };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(() => {
      void sync();
    }, 30000);
    void sync();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [sync, user]);
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("fieldnotes-events")
        : null;
    if (channel)
      channel.onmessage = () => {
        void refresh();
      };
    return () => channel?.close();
  }, [refresh]);
  const save = useCallback(
    async (
      kind: EventKind,
      payload: Record<string, unknown>,
      entryId?: string,
      id = crypto.randomUUID(),
    ) => {
      const event: LearningEvent = {
        id,
        scope,
        kind,
        payload,
        entryId,
        at: new Date().toISOString(),
        synced: user ? 0 : 1,
      };
      try {
        await persist(event);
        if (activeScope.current === scope) {
          await refresh();
          setStatus(user ? "pending" : "local");
          setError("");
        }
        const channel =
          typeof BroadcastChannel !== "undefined"
            ? new BroadcastChannel("fieldnotes-events")
            : null;
        channel?.postMessage("changed");
        channel?.close();
        if (user) void sync();
        return event;
      } catch (err) {
        setStatus("failed");
        setError(
          "未能保存到此设备，请保留当前页面并重试。" +
            (err instanceof Error ? err.message : ""),
        );
        throw err;
      }
    },
    [scope, user, refresh, sync],
  );
  const migrateGuest = async () => {
    if (!user) return;
    const guest = await db.events.where("scope").equals("guest").toArray();
    // UUID mapping is stable per account so repeated imports deduplicate.
    const mappingKey = "fieldnotes-import-" + user.id;
    let map: Record<string, string> = {};
    try {
      map = JSON.parse(localStorage.getItem(mappingKey) || "{}");
    } catch {
      /* start a clean mapping */
    }
    for (const row of guest)
      if (!map[row.id]) map[row.id] = crypto.randomUUID();
    localStorage.setItem(mappingKey, JSON.stringify(map));
    await db.transaction("rw", db.events, async () => {
      for (const row of guest)
        if (!(await db.events.get(map[row.id])))
          await db.events.add({
            ...row,
            id: map[row.id],
            scope: user.id,
            synced: 0,
          });
    });
    await refresh();
    setStatus("pending");
    await sync();
  };
  return {
    user,
    authReady,
    loading,
    scope,
    events,
    state: project(events),
    status,
    error,
    online,
    save,
    sync,
    migrateGuest,
  };
}
