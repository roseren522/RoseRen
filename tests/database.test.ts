import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
it("executes the migration in PostgreSQL and enforces account RLS, immutable events, and idempotent retries", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await pg.exec(
      readFileSync("supabase/migrations/001_learning_events.sql", "utf8"),
    );
    await pg.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);`,
    );
    const insert = `insert into public.learning_events(id,user_id,kind,occurred_at,entry_id,payload) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','review','2026-10-20T00:00:00Z','v001','{"rating":3}');`;
    await pg.exec(insert);
    await pg.exec(insert.replace(";", " on conflict(id) do nothing;"));
    expect(
      (await pg.query("select * from public.learning_events")).rows,
    ).toHaveLength(1);
    await pg.exec(
      `insert into public.learning_events(id,user_id,kind,occurred_at,entry_id,payload) values ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','review',now(),'reading:emissions-concentrations:q1','{"activity":"reading","rating":3,"answer":"a","assessment":"objective"}')`,
    );
    expect(
      (
        await pg.query(
          "select * from public.learning_events where payload->>'activity'='reading'",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      pg.exec(`update public.learning_events set payload='{"rating":4}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(pg.exec("delete from public.learning_events")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      pg.exec(
        `insert into public.learning_events(id,user_id,kind,occurred_at,entry_id,payload) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','review',now(),'v001','{"rating":3}')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      pg.exec(
        `insert into public.learning_events(id,user_id,kind,occurred_at,entry_id,payload) values ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','review',now(),'v001','{}')`,
      ),
    ).rejects.toThrow(/valid_review/i);
    await pg.exec(
      `select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);`,
    );
    expect(
      (await pg.query("select * from public.learning_events")).rows,
    ).toHaveLength(0);
    await pg.exec("set role anon;");
    await expect(
      pg.query("select * from public.learning_events"),
    ).rejects.toThrow(/permission denied/i);
  } finally {
    await pg.close();
  }
}, 20000);
