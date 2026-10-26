-- Run once with the Supabase SQL editor or `supabase db push`.
create table public.learning_events (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('review','favorite','target','timezone','entry','delete')),
 occurred_at timestamptz not null,
 entry_id text,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 received_at timestamptz not null default now(),
 constraint valid_review check (kind <> 'review' or (entry_id is not null and payload ? 'rating' and payload->>'rating' in ('1','2','3','4'))),
 constraint valid_target check (kind <> 'target' or (payload ? 'value' and payload->>'value' in ('5','10','15','20')))
);
create index learning_events_user_time on public.learning_events(user_id,occurred_at,id);
alter table public.learning_events enable row level security;
revoke all on public.learning_events from anon;
revoke all on public.learning_events from authenticated;
grant select, insert on public.learning_events to authenticated;
create policy "Read own events" on public.learning_events for select to authenticated using ((select auth.uid())=user_id);
create policy "Append own events" on public.learning_events for insert to authenticated with check ((select auth.uid())=user_id);
-- Intentionally no UPDATE or DELETE policies. Events are immutable; edits and deletion
-- of personal vocabulary are new events. ON CONFLICT DO NOTHING deduplicates retries.
