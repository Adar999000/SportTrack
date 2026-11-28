-- Mishmaat (משמעת אישית) - Supabase / Postgres schema.
-- Mirrors the Google Sheets tabs used by apps-script/server.js:
--   Users -> profiles (+ auth.users), Weeks, Docs, Posts (feed + stories), Duels, DuelChat,
--   Ledger, Events, Messages, Errors, Analytics, Invites, Audit.
-- JSON arrays kept inside single Sheet cells (likes, comments, reports, story views, meetup RSVPs,
-- duel members, blocks, analytics users) become their own tables: no read-modify-write races and
-- no LockService needed.
--
-- Apply once in a new project: Supabase dashboard -> SQL editor -> paste -> Run
-- (or `supabase db push` with this file as a migration). Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
--
-- Security model
--   * Edge Functions (functions/api) use the caller's JWT for the caller's own rows, so RLS applies,
--     and the service role only for cross-user work (feed people index, rewards of invitees, admin).
--   * RLS is on for every table. Tables with no policy for `authenticated` are server-only.
--   * Columns a user must never change themselves (role, email_verified, history_approved,
--     chat_credits, invited_by) are protected by column privileges.

create extension if not exists pgcrypto;

-- =====================================================================
-- helpers
-- =====================================================================

-- Today in Israel (the server's day boundaries are Asia/Jerusalem, like todayStr() in server.js).
create or replace function public.today_il() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

-- =====================================================================
-- profiles (Users sheet: id,email,name,role,hash,salt,created,seen,photo,profile,extra)
-- Passwords live in auth.users (bcrypt). Legacy Sheet hashes go to legacy_passwords (server-only).
-- =====================================================================
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  legacy_id        text unique,                     -- the 8-char id from the Sheet (kept for the migration)
  email            text not null unique check (email = lower(email) and length(email) <= 120),
  name             text not null check (length(name) between 1 and 60),
  role             text not null default 'user' check (role in ('user', 'admin')),
  created_at       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  photo_path       text,                            -- Storage path in bucket "photos"
  profile          jsonb not null default '{}'::jsonb, -- birthDate, heightCm, goalWeight, goal, goals, gender, completed
  invited_by       uuid references public.profiles (id) on delete set null,
  email_verified   boolean not null default false,
  two_factor       boolean,                         -- null = default (on for admins, off for users)
  history_approved boolean not null default false,
  frame            text not null default '',
  chat_credits     integer not null default 0,
  consent_at       timestamptz,
  consent          text
);
create index if not exists profiles_invited_by_idx on public.profiles (invited_by);
create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';

-- Old Sheet password hashes, checked once on sign-in and then deleted (see functions/_shared/auth.ts).
create table if not exists public.legacy_passwords (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hash    text not null,  -- 'v2$...' (5000 rounds) or legacy (1000 rounds)
  salt    text not null
);

-- Strava OAuth tokens: secrets, server-only (was extra.strava).
create table if not exists public.strava_tokens (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  access   text not null,
  refresh  text not null,
  expires  bigint not null,
  athlete  text not null default ''
);

-- Blocking (was extra.blocks). Hides both ways.
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

create or replace function public.is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and role = 'admin')
$$;

-- Friends = people who signed up with my code, and whoever's code I used (friendsOf in server.js).
create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where (id = a and invited_by = b) or (id = b and invited_by = a))
$$;

-- Either side blocked the other (hiddenFor in server.js).
create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- What anyone signed in may see about another person (leaderboard, feed authors).
create or replace view public.public_profiles with (security_invoker = false) as
  select id, name, photo_path, frame from public.profiles;

-- =====================================================================
-- weeks (Weeks sheet: user,sunday,weight,workouts,meals,photo,updated,data)
-- =====================================================================
create table if not exists public.weeks (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  sunday       date not null check (extract(dow from sunday) = 0),
  start_weight numeric,
  workouts     integer,
  meals_pct    numeric,
  photo_path   text,
  updated_at   bigint not null,                -- client clock in ms (last-writer-wins, as today)
  data         jsonb,
  primary key (user_id, sunday),
  check (data is null or length(data::text) <= 20000)
);
create index if not exists weeks_user_updated_idx on public.weeks (user_id, updated_at);

-- Upsert a batch; a week is replaced only if the incoming updatedAt is newer (putWeeks).
-- Runs as the caller: RLS limits it to the caller's own rows.
create or replace function public.put_weeks(p_weeks jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  w jsonb;
  n integer := 0;
  k integer;
begin
  if uid is null then raise exception 'AUTH: נדרשת התחברות'; end if;
  if jsonb_array_length(p_weeks) > 400 then raise exception 'יותר מדי שבועות בבקשה אחת'; end if;
  for w in select * from jsonb_array_elements(p_weeks) loop
    continue when coalesce(w->>'sundayDate', '') !~ '^\d{4}-\d{2}-\d{2}$';
    continue when length(coalesce(w->'data', 'null'::jsonb)::text) > 20000;
    insert into weeks (user_id, sunday, start_weight, workouts, meals_pct, updated_at, data)
    values (uid, (w->>'sundayDate')::date,
            case when jsonb_typeof(w->'summary'->'startWeight') = 'number' then (w->'summary'->>'startWeight')::numeric end,
            case when jsonb_typeof(w->'summary'->'workouts') = 'number' then (w->'summary'->>'workouts')::numeric::integer end,
            case when jsonb_typeof(w->'summary'->'mealsPct') = 'number' then (w->'summary'->>'mealsPct')::numeric end,
            coalesce(nullif(w->>'updatedAt', '')::bigint, (extract(epoch from now()) * 1000)::bigint),
            w->'data')
    on conflict (user_id, sunday) do update
      set start_weight = excluded.start_weight, workouts = excluded.workouts, meals_pct = excluded.meals_pct,
          updated_at = excluded.updated_at, data = excluded.data   -- photo_path kept
      where weeks.updated_at < excluded.updated_at;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

-- =====================================================================
-- docs (Docs sheet: userId,docId,updatedAt,json) - tracker documents; data null = deleted
-- =====================================================================
create table if not exists public.docs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  doc_id     text not null check (doc_id ~ '^[A-Za-z0-9:_\-]{1,80}$'),
  updated_at bigint not null,
  data       jsonb,
  primary key (user_id, doc_id),
  check (data is null or length(data::text) <= 45000)
);
create index if not exists docs_user_updated_idx on public.docs (user_id, updated_at);

create or replace function public.put_docs(p_docs jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  d jsonb;
  n integer := 0;
  k integer;
  have integer;
begin
  if uid is null then raise exception 'AUTH: נדרשת התחברות'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) > 300 then raise exception 'יותר מדי מסמכים בבקשה אחת'; end if;
  select count(*) into have from docs where user_id = uid;
  for d in select * from jsonb_array_elements(p_docs) loop
    continue when coalesce(d->>'id', '') !~ '^[A-Za-z0-9:_\-]{1,80}$';
    continue when length(coalesce(d->'data', 'null'::jsonb)::text) > 45000;
    if not exists (select 1 from docs where user_id = uid and doc_id = d->>'id') then
      continue when have >= 3000;   -- DOCS_PER_USER
      have := have + 1;
    end if;
    insert into docs (user_id, doc_id, updated_at, data)
    values (uid, d->>'id', coalesce(nullif(d->>'updatedAt', '')::bigint, (extract(epoch from now()) * 1000)::bigint),
            case when d->'data' is null or jsonb_typeof(d->'data') = 'null' then null else d->'data' end)
    on conflict (user_id, doc_id) do update set updated_at = excluded.updated_at, data = excluded.data
      where docs.updated_at < excluded.updated_at;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

-- =====================================================================
-- posts (Posts sheet: id,userId,at,visibility,kind,text,data,photoId,likes,comments,reports,status)
-- Stories are posts with kind = 'story' (live 24h).
-- =====================================================================
create table if not exists public.posts (
  id          text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  author_id   uuid references public.profiles (id) on delete cascade, -- null when team = true
  team        boolean not null default false,                         -- official "צוות משמעת אישית" post
  at          timestamptz not null default now(),
  visibility  text not null default 'all' check (visibility in ('all', 'friends')),
  kind        text not null default 'text' check (kind in ('text', 'achievement', 'tracker', 'event', 'meetup', 'story')),
  text        text not null default '' check (length(text) <= 1000),
  data        jsonb,                                                  -- photos[], story fields, meetup fields (no views/going)
  photo_path  text,
  status      text not null default 'ok' check (status in ('ok', 'hidden')),
  check (team or author_id is not null),
  check (data is null or length(data::text) <= 4000)
);
create index if not exists posts_feed_idx on public.posts (at desc) where kind <> 'story';
create index if not exists posts_stories_idx on public.posts (at desc) where kind = 'story';
create index if not exists posts_author_idx on public.posts (author_id, at desc);

create table if not exists public.post_likes (
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id      text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text    text not null check (length(text) between 1 and 500),
  at      timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, at);

create table if not exists public.post_reports (
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason  text not null default '' check (length(reason) <= 200),
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.story_views (
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.meetup_going (
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Three reports hide a post until an admin looks at it (reportPost).
create or replace function public.hide_reported_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from post_reports where post_id = new.post_id) >= 3 then
    update posts set status = 'hidden' where id = new.post_id;
  end if;
  return new;
end $$;
drop trigger if exists post_reports_hide on public.post_reports;
create trigger post_reports_hide after insert on public.post_reports for each row execute function public.hide_reported_post();

-- canSeePost + hiddenFor in one place.
create or replace function public.can_see_post(p public.posts, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p.author_id = uid
      or (p.status = 'ok'
          and (p.team or not is_blocked(uid, p.author_id))
          and (p.visibility = 'all' or p.team or is_friend(uid, p.author_id)))
$$;

-- =====================================================================
-- duels (Duels sheet: id,createdBy,title,metric,start,end,members,code,status,createdAt,winners)
-- =====================================================================
create table if not exists public.duels (
  id          text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (length(title) <= 60),
  metric      text not null,          -- workouts|runs|healthy|fullDays|coins or team:<metric>:<target>
  start_date  date not null,
  end_date    date not null,
  code        text not null unique,
  status      text not null default 'active' check (status in ('active', 'done')),
  created_at  timestamptz not null default now(),
  winners     uuid[] not null default '{}',
  check (end_date >= start_date)
);
create index if not exists duels_active_end_idx on public.duels (end_date) where status = 'active';

create table if not exists public.duel_members (
  duel_id text not null references public.duels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status  text not null check (status in ('in', 'invited', 'declined')),
  primary key (duel_id, user_id)
);
create index if not exists duel_members_user_idx on public.duel_members (user_id);

create table if not exists public.duel_chat (
  id      text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  duel_id text not null references public.duels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  text    text not null check (length(text) between 1 and 500)
);
create index if not exists duel_chat_duel_idx on public.duel_chat (duel_id, at);

create or replace function public.is_duel_member(d text, uid uuid default auth.uid(), need_in boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from duel_members where duel_id = d and user_id = uid
                 and status <> 'declined' and (not need_in or status = 'in'))
$$;

-- =====================================================================
-- ledger (Ledger sheet: userId,at,amount,ref,label) - spending and server-paid prizes
-- Earned coins are still computed from weeks (rewardsFor), never stored.
-- =====================================================================
create table if not exists public.ledger (
  id      bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  amount  integer not null,
  ref     text not null,      -- freezeDay:<date> | freezeWeek:<sunday> | chat10 | item:<kind>:<id> | quest:firstweek | duel:<id>
  label   text not null default ''
);
create index if not exists ledger_user_idx on public.ledger (user_id, at);
-- A prize or purchase can happen once per user ("chat10" can repeat).
create unique index if not exists ledger_once_idx on public.ledger (user_id, ref) where ref <> 'chat10';

-- =====================================================================
-- events (Events sheet: id,title,date,location,type,url,details,status,createdBy,createdAt)
-- =====================================================================
create table if not exists public.events (
  id          text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  title       text not null check (length(title) between 1 and 120),
  date        date not null,
  location    text not null default '' check (length(location) <= 120),
  type        text not null default 'other' check (type in ('run', 'crossfit', 'triathlon', 'cycling', 'swim', 'other')),
  url         text not null default '' check (url = '' or url ~ '^https://[^\s]{3,300}$'),
  details     text not null default '' check (length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (date) where status = 'approved';

-- =====================================================================
-- messages (Messages sheet: id,userId,at,from,subject,text,status) - support inbox
-- =====================================================================
create table if not exists public.messages (
  id          text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  user_id     uuid references public.profiles (id) on delete cascade, -- null for visitors (publicContact)
  guest_email text,                                                  -- was 'guest:<email>' in the userId column
  at          timestamptz not null default now(),
  "from"      text not null check ("from" in ('user', 'admin')),
  subject     text not null default '' check (length(subject) <= 120),
  text        text not null check (length(text) between 1 and 2000),
  status      text not null default 'new' check (status in ('new', 'unread', 'read', 'done')),
  check (user_id is not null or guest_email is not null)
);
create index if not exists messages_user_idx on public.messages (user_id, at);

-- =====================================================================
-- errors (Errors sheet) - client crash reports, emails scrubbed
-- =====================================================================
create table if not exists public.errors (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  version text not null default '',
  screen  text not null default '',
  message text not null default '',
  stack   text not null default '',
  agent   text not null default '',
  user_id uuid references public.profiles (id) on delete set null
);
create index if not exists errors_at_idx on public.errors (at desc);

-- =====================================================================
-- analytics (Analytics sheet: day,event,count,users) - aggregated feature use, no content
-- =====================================================================
create table if not exists public.analytics (
  day   date not null,
  event text not null check (event ~ '^[a-z0-9:_\-]{1,40}$'),
  count integer not null default 0,
  primary key (day, event)
);
create table if not exists public.analytics_users (
  day     date not null,
  event   text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (day, event, user_id),
  foreign key (day, event) references public.analytics (day, event) on delete cascade
);

-- =====================================================================
-- invites (Invites sheet: code,createdAt,usedBy,usedAt,createdBy,multi)
-- =====================================================================
create table if not exists public.invites (
  code        text primary key check (code = upper(code)),
  created_at  timestamptz not null default now(),
  used_by     text,                 -- email of the person who used a one-time code
  used_at     timestamptz,
  created_by  uuid references public.profiles (id) on delete cascade,
  multi       boolean not null default false   -- personal code: any number of sign-ups
);
create index if not exists invites_creator_idx on public.invites (created_by) where multi;

-- =====================================================================
-- audit (Audit sheet) - security events, never passwords or codes
-- =====================================================================
create table if not exists public.audit (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  event   text not null,
  detail  text not null default '' check (length(detail) <= 200)
);
create index if not exists audit_at_idx on public.audit (at desc);

-- =====================================================================
-- server-only state that replaces CacheService / Script properties
-- =====================================================================
-- Rate limits and daily counters (dailyCount, login fails, registrations per hour).
create table if not exists public.counters (
  key        text primary key,
  n          integer not null default 0,
  expires_at timestamptz not null
);
-- Emailed codes: 2FA challenge, password reset, email verification.
create table if not exists public.auth_codes (
  key        text primary key,          -- '2fa:<challenge>' | 'reset:<email>' | 'verify:<userId>'
  user_id    uuid references public.profiles (id) on delete cascade,
  hash       text not null,
  salt       text not null,
  tries      integer not null default 0,
  sent_at    timestamptz not null default now(),
  expires_at timestamptz not null,
  payload    jsonb                      -- 2FA: the held session (refresh token), released only after the code
);
-- Site configuration and flags (SITE_CONFIG, VERIFY_POSTING, VERIFY_SINCE, REWARDS_START, AI spend...).
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- Increment a counter; raises with `msg` when it would pass `max`. Returns the new value.
create or replace function public.bump_counter(p_key text, p_max integer, p_ttl_seconds integer, p_msg text default 'יותר מדי בקשות')
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  delete from counters where key = p_key and expires_at < now();
  insert into counters (key, n, expires_at) values (p_key, 1, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update set n = counters.n + 1
  returning n into v;
  if v > p_max then
    update counters set n = n - 1 where key = p_key;
    raise exception '%', p_msg;
  end if;
  return v;
end $$;
revoke all on function public.bump_counter(text, integer, integer, text) from public, anon, authenticated;

-- =====================================================================
-- new auth user -> profile row (name/consent/invite come from the register Edge Function)
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, email, name, role, created_at, last_seen)
  values (new.id, lower(new.email), coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          case when first_user then 'admin' else 'user' end, now(), now())
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- =====================================================================
-- row-level security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.legacy_passwords enable row level security;
alter table public.strava_tokens    enable row level security;
alter table public.blocks           enable row level security;
alter table public.weeks            enable row level security;
alter table public.docs             enable row level security;
alter table public.posts            enable row level security;
alter table public.post_likes       enable row level security;
alter table public.post_comments    enable row level security;
alter table public.post_reports     enable row level security;
alter table public.story_views      enable row level security;
alter table public.meetup_going     enable row level security;
alter table public.duels            enable row level security;
alter table public.duel_members     enable row level security;
alter table public.duel_chat        enable row level security;
alter table public.ledger           enable row level security;
alter table public.events           enable row level security;
alter table public.messages         enable row level security;
alter table public.errors           enable row level security;
alter table public.analytics        enable row level security;
alter table public.analytics_users  enable row level security;
alter table public.invites          enable row level security;
alter table public.audit            enable row level security;
alter table public.counters         enable row level security;
alter table public.auth_codes       enable row level security;
alter table public.settings         enable row level security;
-- legacy_passwords, strava_tokens, counters, auth_codes, settings, errors(read), audit(write):
-- no policy for anon/authenticated = server (service role) only.

-- helper to (re)create a policy idempotently
create or replace function pg_temp.policy(p_name text, p_table text, p_sql text) returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute p_sql;
end $$;

-- profiles: read own row (admins read all); everyone signed in reads public_profiles (view).
select pg_temp.policy('profiles_select', 'profiles',
  $p$create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin())$p$);
select pg_temp.policy('profiles_update_own', 'profiles',
  $p$create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid())$p$);
select pg_temp.policy('profiles_admin_update', 'profiles',
  $p$create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin())$p$);
-- Users may change only these columns of their own row; role/verification/coins go through Edge Functions.
revoke update on public.profiles from authenticated;
grant update (name, photo_path, profile, frame, last_seen) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;
grant select on public.public_profiles to authenticated;

-- blocks: I see and manage the blocks I made.
select pg_temp.policy('blocks_own', 'blocks',
  $p$create policy blocks_own on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid())$p$);

-- weeks & docs: each user reads/writes only their own rows; admins read (aggregates in admin views).
select pg_temp.policy('weeks_own', 'weeks',
  $p$create policy weeks_own on public.weeks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())$p$);
select pg_temp.policy('weeks_admin_read', 'weeks',
  $p$create policy weeks_admin_read on public.weeks for select to authenticated using (public.is_admin())$p$);
select pg_temp.policy('docs_own', 'docs',
  $p$create policy docs_own on public.docs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())$p$);

-- posts: visibility all/friends, hidden posts only for their author, blocking both ways; admins see everything.
select pg_temp.policy('posts_select', 'posts',
  $p$create policy posts_select on public.posts for select to authenticated using (public.can_see_post(posts) or public.is_admin())$p$);
select pg_temp.policy('posts_insert_own', 'posts',
  $p$create policy posts_insert_own on public.posts for insert to authenticated
     with check (author_id = auth.uid() and not team and status = 'ok')$p$);
select pg_temp.policy('posts_update_own', 'posts',
  $p$create policy posts_update_own on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and status = 'ok')$p$);
select pg_temp.policy('posts_delete', 'posts',
  $p$create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid() or public.is_admin())$p$);
select pg_temp.policy('posts_admin_update', 'posts',
  $p$create policy posts_admin_update on public.posts for update to authenticated using (public.is_admin()) with check (public.is_admin())$p$);

-- likes: visible with the post; I add/remove only my own like on posts I can see.
select pg_temp.policy('likes_select', 'post_likes',
  $p$create policy likes_select on public.post_likes for select to authenticated
     using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p)))$p$);
select pg_temp.policy('likes_write_own', 'post_likes',
  $p$create policy likes_write_own on public.post_likes for insert to authenticated
     with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p)))$p$);
select pg_temp.policy('likes_delete_own', 'post_likes',
  $p$create policy likes_delete_own on public.post_likes for delete to authenticated using (user_id = auth.uid())$p$);

-- comments: story replies are private (author of the story sees all, others only their own);
-- comments by people I blocked / who blocked me are hidden.
select pg_temp.policy('comments_select', 'post_comments',
  $p$create policy comments_select on public.post_comments for select to authenticated using (
     not public.is_blocked(auth.uid(), user_id) and exists (
       select 1 from public.posts p where p.id = post_id and public.can_see_post(p)
       and (p.kind <> 'story' or p.author_id = auth.uid() or user_id = auth.uid())))$p$);
select pg_temp.policy('comments_insert_own', 'post_comments',
  $p$create policy comments_insert_own on public.post_comments for insert to authenticated with check (
     user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p)
       and (p.team or not public.is_blocked(auth.uid(), p.author_id))))$p$);
select pg_temp.policy('comments_delete', 'post_comments',
  $p$create policy comments_delete on public.post_comments for delete to authenticated using (
     user_id = auth.uid() or public.is_admin()
     or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))$p$);

-- reports: I file my own; admins read them.
select pg_temp.policy('reports_insert_own', 'post_reports',
  $p$create policy reports_insert_own on public.post_reports for insert to authenticated with check (
     user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.author_id is distinct from auth.uid() and public.can_see_post(p)))$p$);
select pg_temp.policy('reports_admin_read', 'post_reports',
  $p$create policy reports_admin_read on public.post_reports for select to authenticated using (public.is_admin() or user_id = auth.uid())$p$);

-- story views: viewers record their own view; the story's author reads who viewed.
select pg_temp.policy('views_insert_own', 'story_views',
  $p$create policy views_insert_own on public.story_views for insert to authenticated with check (
     user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.kind = 'story'
       and p.author_id <> auth.uid() and public.can_see_post(p)))$p$);
select pg_temp.policy('views_select', 'story_views',
  $p$create policy views_select on public.story_views for select to authenticated using (
     user_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))$p$);

-- meetup RSVPs: visible with the post; I toggle only my own.
select pg_temp.policy('going_select', 'meetup_going',
  $p$create policy going_select on public.meetup_going for select to authenticated
     using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p)))$p$);
select pg_temp.policy('going_insert_own', 'meetup_going',
  $p$create policy going_insert_own on public.meetup_going for insert to authenticated with check (
     user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.kind = 'meetup' and public.can_see_post(p)))$p$);
select pg_temp.policy('going_delete_own', 'meetup_going',
  $p$create policy going_delete_own on public.meetup_going for delete to authenticated using (user_id = auth.uid())$p$);

-- duels: members (not declined) read; creation, joining by code and settling go through Edge Functions.
select pg_temp.policy('duels_select', 'duels',
  $p$create policy duels_select on public.duels for select to authenticated using (public.is_duel_member(id) or public.is_admin())$p$);
select pg_temp.policy('duel_members_select', 'duel_members',
  $p$create policy duel_members_select on public.duel_members for select to authenticated using (public.is_duel_member(duel_id))$p$);
select pg_temp.policy('duel_members_update_own', 'duel_members',
  $p$create policy duel_members_update_own on public.duel_members for update to authenticated
     using (user_id = auth.uid()) with check (user_id = auth.uid() and status in ('in', 'declined'))$p$);
select pg_temp.policy('duel_chat_select', 'duel_chat',
  $p$create policy duel_chat_select on public.duel_chat for select to authenticated
     using (public.is_duel_member(duel_id) and not public.is_blocked(auth.uid(), user_id))$p$);
select pg_temp.policy('duel_chat_insert', 'duel_chat',
  $p$create policy duel_chat_insert on public.duel_chat for insert to authenticated
     with check (user_id = auth.uid() and public.is_duel_member(duel_id, auth.uid(), true))$p$);

-- ledger: read own; written only by Edge Functions (balance checks happen there).
select pg_temp.policy('ledger_select_own', 'ledger',
  $p$create policy ledger_select_own on public.ledger for select to authenticated using (user_id = auth.uid() or public.is_admin())$p$);

-- events: approved upcoming ones for everyone, my own pending suggestions, all for admins.
select pg_temp.policy('events_select', 'events',
  $p$create policy events_select on public.events for select to authenticated using (
     status = 'approved' or created_by = auth.uid() or public.is_admin())$p$);
select pg_temp.policy('events_admin_write', 'events',
  $p$create policy events_admin_write on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin())$p$);

-- messages: my own support thread; admins all.
select pg_temp.policy('messages_select', 'messages',
  $p$create policy messages_select on public.messages for select to authenticated using (user_id = auth.uid() or public.is_admin())$p$);

-- errors / analytics / audit: admins read; writes only from Edge Functions.
select pg_temp.policy('errors_admin_read', 'errors',
  $p$create policy errors_admin_read on public.errors for select to authenticated using (public.is_admin())$p$);
select pg_temp.policy('analytics_admin_read', 'analytics',
  $p$create policy analytics_admin_read on public.analytics for select to authenticated using (public.is_admin())$p$);
select pg_temp.policy('analytics_users_admin_read', 'analytics_users',
  $p$create policy analytics_users_admin_read on public.analytics_users for select to authenticated using (public.is_admin())$p$);
select pg_temp.policy('audit_admin_read', 'audit',
  $p$create policy audit_admin_read on public.audit for select to authenticated using (public.is_admin())$p$);

-- invites: my own codes; admins all.
select pg_temp.policy('invites_select', 'invites',
  $p$create policy invites_select on public.invites for select to authenticated using (created_by = auth.uid() or public.is_admin())$p$);

-- Functions callable by signed-in users.
grant execute on function public.put_weeks(jsonb) to authenticated;
grant execute on function public.put_docs(jsonb) to authenticated;
revoke execute on function public.put_weeks(jsonb) from anon;
revoke execute on function public.put_docs(jsonb) from anon;

-- =====================================================================
-- storage: one private bucket for photos (profile, week, post). Paths: <userId>/<kind>-<id>.jpg
-- Profile and post photos are served through the Edge Function (getPhoto) which checks access,
-- exactly like server.js. TODO: signed URLs instead of base64 once the client accepts URLs.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- =====================================================================
-- scheduled jobs (enable pg_cron in Database -> Extensions first). Replace Apps Script triggers.
-- =====================================================================
-- select cron.schedule('settle-duels', '5 0 * * *', $$ select net.http_post(url := '<project-url>/functions/v1/api', ... ) $$);
-- TODO: settle duels nightly, purge counters/auth_codes past expires_at, trim errors to 3000 rows.
-- Backups: Supabase takes daily backups on paid plans; on free, schedule `pg_dump` from CI.
