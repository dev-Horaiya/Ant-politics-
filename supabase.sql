-- Ant Politics: database setup for Supabase (version 2: feed, comments, avatars).
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once. Running it again on your existing project upgrades it.
--
-- How security works: every table has Row Level Security (RLS) turned on.
-- The website only holds the public "anon" key, so these rules are the real protection.
-- No emails, phone numbers or IP addresses are stored in these tables.

-- ============ TABLES ============

create table if not exists public.anthills (
  id serial primary key,
  slug text unique not null,
  name text not null,
  name_bn text
);

insert into public.anthills (slug, name, name_bn)
values ('bangladesh', 'Bangladesh', 'বাংলাদেশ')
on conflict (slug) do nothing;

create table if not exists public.chambers (
  id serial primary key,
  anthill_id int not null references public.anthills (id),
  slug text unique not null,
  name text not null,
  name_bn text,
  kind text not null default 'division' check (kind in ('national', 'division'))
);

insert into public.chambers (anthill_id, slug, name, name_bn, kind)
select a.id, v.slug, v.name, v.name_bn, v.kind
from public.anthills a,
  (values
    ('national',   'All Bangladesh', 'সারা বাংলাদেশ', 'national'),
    ('dhaka',      'Dhaka',          'ঢাকা',          'division'),
    ('chattogram', 'Chattogram',     'চট্টগ্রাম',      'division'),
    ('rajshahi',   'Rajshahi',       'রাজশাহী',       'division'),
    ('khulna',     'Khulna',         'খুলনা',         'division'),
    ('barishal',   'Barishal',       'বরিশাল',        'division'),
    ('sylhet',     'Sylhet',         'সিলেট',         'division'),
    ('rangpur',    'Rangpur',        'রংপুর',         'division'),
    ('mymensingh', 'Mymensingh',     'ময়মনসিংহ',     'division')
  ) as v (slug, name, name_bn, kind)
where a.slug = 'bangladesh'
on conflict (slug) do nothing;

-- One row per anonymous user. Only the handle, rank and avatar are public.
create table if not exists public.ants (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null,
  rank text not null default 'worker' check (rank in ('worker', 'scout', 'soldier')),
  created_at timestamptz not null default now()
);

-- NEW in v2: the avatar is a small list of part choices, never an image.
alter table public.ants add column if not exists avatar jsonb not null default '{}'::jsonb;

create table if not exists public.trails (
  id bigserial primary key,
  ant_id uuid not null references public.ants (id) on delete cascade,
  chamber_id int not null references public.chambers (id),
  body text not null check (char_length(body) between 1 and 500),
  source_url text check (
    source_url is null or (char_length(source_url) <= 500 and source_url ~* '^https?://')
  ),
  created_at timestamptz not null default now()
);
create index if not exists trails_chamber_idx on public.trails (chamber_id, created_at desc);
create index if not exists trails_ant_idx on public.trails (ant_id, created_at desc);
create index if not exists trails_created_idx on public.trails (created_at desc);

create table if not exists public.votes (
  trail_id bigint not null references public.trails (id) on delete cascade,
  ant_id uuid not null references public.ants (id) on delete cascade,
  kind text not null check (kind in ('agree', 'disagree', 'convince')),
  created_at timestamptz not null default now(),
  primary key (trail_id, ant_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.ants (id) on delete cascade,
  followee_id uuid not null references public.ants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

-- NEW in v2: comments (replies nest up to 3 levels) and comment agrees.
create table if not exists public.comments (
  id bigserial primary key,
  trail_id bigint not null references public.trails (id) on delete cascade,
  parent_id bigint references public.comments (id) on delete cascade,
  ant_id uuid not null references public.ants (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  source_url text check (
    source_url is null or (char_length(source_url) <= 500 and source_url ~* '^https?://')
  ),
  created_at timestamptz not null default now()
);
create index if not exists comments_trail_idx on public.comments (trail_id, created_at);
create index if not exists comments_ant_idx on public.comments (ant_id, created_at desc);

create table if not exists public.comment_agrees (
  comment_id bigint not null references public.comments (id) on delete cascade,
  ant_id uuid not null references public.ants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, ant_id)
);

-- ============ ROW LEVEL SECURITY ============

alter table public.anthills enable row level security;
alter table public.chambers enable row level security;
alter table public.ants enable row level security;
alter table public.trails enable row level security;
alter table public.votes enable row level security;
alter table public.follows enable row level security;
alter table public.comments enable row level security;
alter table public.comment_agrees enable row level security;

-- Nobody can write through the public API unless a policy below allows it.
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update, delete on public.anthills, public.chambers, public.ants from authenticated;
-- The only thing a signed-in ant may change on its own row is its avatar.
grant update (avatar) on public.ants to authenticated;

-- Public read: anthills, chambers, ants (handle, rank, avatar), trails, comments.
drop policy if exists anthills_read on public.anthills;
create policy anthills_read on public.anthills for select to anon, authenticated using (true);

drop policy if exists chambers_read on public.chambers;
create policy chambers_read on public.chambers for select to anon, authenticated using (true);

drop policy if exists ants_read on public.ants;
create policy ants_read on public.ants for select to anon, authenticated using (true);

drop policy if exists ants_update_own on public.ants;
create policy ants_update_own on public.ants for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists trails_read on public.trails;
create policy trails_read on public.trails for select to anon, authenticated using (true);

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to anon, authenticated using (true);

-- Trails and comments: you can post and delete only as yourself.
drop policy if exists trails_insert on public.trails;
create policy trails_insert on public.trails for insert to authenticated
  with check (ant_id = (select auth.uid()));

drop policy if exists trails_delete on public.trails;
create policy trails_delete on public.trails for delete to authenticated
  using (ant_id = (select auth.uid()));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (ant_id = (select auth.uid()));

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (ant_id = (select auth.uid()));

-- Votes: you can see and change only your own votes. Totals come from the views below.
drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes for select to authenticated
  using (ant_id = (select auth.uid()));

drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes for insert to authenticated
  with check (ant_id = (select auth.uid()));

drop policy if exists votes_update on public.votes;
create policy votes_update on public.votes for update to authenticated
  using (ant_id = (select auth.uid())) with check (ant_id = (select auth.uid()));

drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes for delete to authenticated
  using (ant_id = (select auth.uid()));

-- Comment agrees: same idea as votes.
drop policy if exists agrees_select on public.comment_agrees;
create policy agrees_select on public.comment_agrees for select to authenticated
  using (ant_id = (select auth.uid()));

drop policy if exists agrees_insert on public.comment_agrees;
create policy agrees_insert on public.comment_agrees for insert to authenticated
  with check (ant_id = (select auth.uid()));

drop policy if exists agrees_delete on public.comment_agrees;
create policy agrees_delete on public.comment_agrees for delete to authenticated
  using (ant_id = (select auth.uid()));

-- Follows: you can see and change only the follows you made.
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()));

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ============ RANK LEVEL ============
-- 0 = Worker, 1 = Scout (100 followers), 2 = Soldier (elected, stored on the ant).

create or replace function public.ant_level(p_ant uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.rank = 'soldier' then 2
    when (select count(*) from public.follows f where f.followee_id = a.id) >= 100 then 1
    else 0
  end
  from public.ants a
  where a.id = p_ant;
$$;

grant execute on function public.ant_level(uuid) to anon, authenticated;

-- ============ VIEWS (public totals without exposing who voted what) ============

drop view if exists public.trail_feed;
drop view if exists public.comment_feed;
drop view if exists public.ant_profiles;

create view public.ant_profiles as
select
  a.id,
  a.handle,
  a.rank,
  a.created_at,
  a.avatar,
  public.ant_level(a.id) as level,
  (select count(*) from public.follows f where f.followee_id = a.id)::int as followers,
  (select count(*) from public.trails t where t.ant_id = a.id)::int as trails,
  exists (
    select 1 from public.follows f where f.followee_id = a.id and f.follower_id = auth.uid()
  ) as i_follow
from public.ants a;

create view public.trail_feed as
select
  t.id,
  t.body,
  t.source_url,
  t.created_at,
  t.ant_id,
  a.handle,
  a.avatar,
  public.ant_level(a.id) as level,
  c.slug as chamber_slug,
  c.name as chamber_name,
  vc.agree,
  vc.disagree,
  vc.convince,
  cc.n as comment_count,
  (select v.kind from public.votes v where v.trail_id = t.id and v.ant_id = auth.uid()) as my_vote,
  exists (
    select 1 from public.follows f where f.followee_id = t.ant_id and f.follower_id = auth.uid()
  ) as i_follow_author,
  (
    (vc.agree * 2 + vc.convince + cc.n * 3 + 1)::float8
    / power((extract(epoch from (now() - t.created_at)) / 3600.0 + 2)::float8, 1.5::float8)
  )::float8 as hot_score
from public.trails t
join public.ants a on a.id = t.ant_id
join public.chambers c on c.id = t.chamber_id
cross join lateral (
  select
    (count(*) filter (where v.kind = 'agree'))::int as agree,
    (count(*) filter (where v.kind = 'disagree'))::int as disagree,
    (count(*) filter (where v.kind = 'convince'))::int as convince
  from public.votes v
  where v.trail_id = t.id
) vc
cross join lateral (
  select count(*)::int as n from public.comments cm where cm.trail_id = t.id
) cc;

create view public.comment_feed as
select
  cm.id,
  cm.trail_id,
  cm.parent_id,
  cm.body,
  cm.source_url,
  cm.created_at,
  cm.ant_id,
  a.handle,
  a.avatar,
  public.ant_level(a.id) as level,
  (select count(*) from public.comment_agrees g where g.comment_id = cm.id)::int as agree,
  exists (
    select 1 from public.comment_agrees g where g.comment_id = cm.id and g.ant_id = auth.uid()
  ) as i_agree
from public.comments cm
join public.ants a on a.id = cm.ant_id;

revoke all on public.trail_feed, public.comment_feed, public.ant_profiles from anon, authenticated;
grant select on public.trail_feed, public.comment_feed, public.ant_profiles to anon, authenticated;

-- ============ FUNCTIONS ============

-- Creates your public ant (a random handle like Ant-7f3k9) the first time you join.
create or replace function public.create_ant()
returns public.ants
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.ants;
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  h text;
begin
  if uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into a from public.ants where id = uid;
  if found then
    return a;
  end if;

  for tries in 1..10 loop
    h := 'Ant-';
    for i in 1..5 loop
      h := h || substr(alphabet, 1 + floor(random() * 31)::int, 1);
    end loop;
    begin
      insert into public.ants (id, handle) values (uid, h) returning * into a;
      return a;
    exception when unique_violation then
      select * into a from public.ants where id = uid;
      if found then
        return a;
      end if;
    end;
  end loop;

  raise exception 'Could not create an ant. Please try again.';
end;
$$;

revoke execute on function public.create_ant() from public, anon;
grant execute on function public.create_ant() to authenticated;

-- Anti-spam: at most 20 trails per ant per hour.
create or replace function public.limit_trails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.trails
    where ant_id = new.ant_id and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Slow down, ant. You can leave up to 20 trails per hour.';
  end if;
  return new;
end;
$$;

drop trigger if exists trails_rate_limit on public.trails;
create trigger trails_rate_limit
before insert on public.trails
for each row execute function public.limit_trails();

-- Comments: replies must stay on the same trail, nest at most 3 levels, and 40 per hour.
create or replace function public.guard_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.comments;
  depth int;
  cur bigint;
begin
  if new.parent_id is not null then
    select * into p from public.comments where id = new.parent_id;
    if not found or p.trail_id <> new.trail_id then
      raise exception 'That comment is not on this trail.';
    end if;
    depth := 1;
    cur := p.parent_id;
    while cur is not null loop
      depth := depth + 1;
      select parent_id into cur from public.comments where id = cur;
    end loop;
    if depth > 2 then
      raise exception 'Replies can only go three levels deep.';
    end if;
  end if;

  if (
    select count(*) from public.comments
    where ant_id = new.ant_id and created_at > now() - interval '1 hour'
  ) >= 40 then
    raise exception 'Slow down, ant. You can write up to 40 comments per hour.';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
before insert on public.comments
for each row execute function public.guard_comment();

-- ============ AVATAR RULES ============
-- The avatar is a small JSON object of part choices. This catalog lists every allowed
-- choice and the rank level it needs (0 Worker, 1 Scout, 2 Soldier). The database
-- rejects anything else, so nobody can store an image, a link or a locked part.

create or replace function public.avatar_catalog()
returns jsonb
language sql
immutable
as $$
  select '{
    "body":     {"ink":0,"red":0,"brown":0,"green":0,"blue":0,"pink":0,"gold":2},
    "marks":    {"none":0,"freckles":0,"blush":0,"stripes":0},
    "eyes":     {"round":0,"sleepy":0,"angry":0,"wink":0},
    "mouth":    {"smile":0,"flat":0,"shout":0,"smirk":0},
    "antennae": {"straight":0,"curly":0,"bent":1},
    "hat":      {"none":0,"cap":0,"party":0,"hard":1,"crown":2},
    "eyewear":  {"none":0,"round":0,"shades":1},
    "outfit":   {"none":0,"bow":0,"tie":0,"gamcha":1,"medal":2},
    "item":     {"none":0,"crumb":0,"cha":0,"mega":1,"signsrc":1,"signvote":1},
    "bg":       {"yellow":0,"rose":0,"mint":0,"sky":0,"stone":0,"soil":0,"night":0},
    "pattern":  {"none":0,"dots":0,"stripes":1,"burst":1}
  }'::jsonb;
$$;

create or replace function public.check_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cat jsonb := public.avatar_catalog();
  k text;
  v jsonb;
  val text;
  tier int;
  lvl int;
begin
  if new.avatar is null or jsonb_typeof(new.avatar) <> 'object' then
    raise exception 'The avatar must be a list of part choices.';
  end if;
  if length(new.avatar::text) > 700 then
    raise exception 'That avatar is too large.';
  end if;

  lvl := coalesce(public.ant_level(new.id), 0);

  for k, v in select key, value from jsonb_each(new.avatar) loop
    if jsonb_typeof(v) <> 'string' then
      raise exception 'Invalid avatar choice for %.', k;
    end if;
    val := v #>> '{}';

    if k in ('bodyHex', 'bgHex') then
      if val !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'Colors must look like #1c1917.';
      end if;
    else
      if not (cat ? k) or not ((cat -> k) ? val) then
        raise exception 'Unknown avatar part: %.', k;
      end if;
      tier := ((cat -> k) ->> val)::int;
      if tier > lvl then
        raise exception 'That part is locked until you reach a higher rank.';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists ants_avatar_check on public.ants;
create trigger ants_avatar_check
before insert or update of avatar on public.ants
for each row execute function public.check_avatar();
