-- Ant Politics: database setup for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.
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

-- One row per anonymous user. Only the handle and rank are public.
create table if not exists public.ants (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null,
  rank text not null default 'worker' check (rank in ('worker', 'scout', 'soldier')),
  created_at timestamptz not null default now()
);

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

-- ============ ROW LEVEL SECURITY ============

alter table public.anthills enable row level security;
alter table public.chambers enable row level security;
alter table public.ants enable row level security;
alter table public.trails enable row level security;
alter table public.votes enable row level security;
alter table public.follows enable row level security;

-- Nobody can write through the public API unless a policy below allows it.
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update, delete on public.anthills, public.chambers, public.ants from authenticated;

-- Public read: anthills, chambers, ants (handle and rank only), trails.
drop policy if exists anthills_read on public.anthills;
create policy anthills_read on public.anthills for select to anon, authenticated using (true);

drop policy if exists chambers_read on public.chambers;
create policy chambers_read on public.chambers for select to anon, authenticated using (true);

drop policy if exists ants_read on public.ants;
create policy ants_read on public.ants for select to anon, authenticated using (true);

drop policy if exists trails_read on public.trails;
create policy trails_read on public.trails for select to anon, authenticated using (true);

-- Trails: you can post and delete only as yourself.
drop policy if exists trails_insert on public.trails;
create policy trails_insert on public.trails for insert to authenticated
  with check (ant_id = (select auth.uid()));

drop policy if exists trails_delete on public.trails;
create policy trails_delete on public.trails for delete to authenticated
  using (ant_id = (select auth.uid()));

-- Votes: you can see and change only your own votes. Totals come from the view below.
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

-- ============ VIEWS (public totals without exposing who voted what) ============

create or replace view public.trail_feed as
select
  t.id,
  t.body,
  t.source_url,
  t.created_at,
  t.ant_id,
  a.handle,
  c.slug as chamber_slug,
  c.name as chamber_name,
  (select count(*) from public.votes v where v.trail_id = t.id and v.kind = 'agree')::int as agree,
  (select count(*) from public.votes v where v.trail_id = t.id and v.kind = 'disagree')::int as disagree,
  (select count(*) from public.votes v where v.trail_id = t.id and v.kind = 'convince')::int as convince,
  (select v.kind from public.votes v where v.trail_id = t.id and v.ant_id = auth.uid()) as my_vote
from public.trails t
join public.ants a on a.id = t.ant_id
join public.chambers c on c.id = t.chamber_id;

create or replace view public.ant_profiles as
select
  a.id,
  a.handle,
  a.rank,
  a.created_at,
  (select count(*) from public.follows f where f.followee_id = a.id)::int as followers,
  (select count(*) from public.trails t where t.ant_id = a.id)::int as trails,
  exists (
    select 1 from public.follows f where f.followee_id = a.id and f.follower_id = auth.uid()
  ) as i_follow
from public.ants a;

revoke all on public.trail_feed, public.ant_profiles from anon, authenticated;
grant select on public.trail_feed, public.ant_profiles to anon, authenticated;

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
