-- ------------------------------------------------------------
-- Supabase Migration: Quiz History, Roles & RLS Policies
-- Target: Supabase Postgres
-- ------------------------------------------------------------

-- 1. Create admins table
create table if not exists public.admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);

-- 2. Create users table
create table if not exists public.users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null check (char_length(username) between 3 and 30),
    created_at timestamptz not null default now()
);

-- 3. Create quiz_history table
-- Note: words.id is bigint, so word_id is bigint
create table if not exists public.quiz_history (
    attempt_id bigint generated always as identity primary key,
    user_id uuid not null references public.users(user_id) on delete cascade,
    word_id bigint not null references public.words(id) on delete cascade,
    correct boolean not null,
    created_at timestamptz not null default now()
);

-- Indexes for quiz_history
create index if not exists idx_quiz_history_user_id on public.quiz_history(user_id);
create index if not exists idx_quiz_history_user_word on public.quiz_history(user_id, word_id);

-- 4. Helper function: is_admin()
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- 5. Enable Row Level Security (RLS) on all four tables
alter table public.words enable row level security;
alter table public.admins enable row level security;
alter table public.users enable row level security;
alter table public.quiz_history enable row level security;

-- ------------------------------------------------------------
-- RLS Policies: words
-- SELECT for anon and authenticated. INSERT, UPDATE, DELETE only when is_admin().
-- ------------------------------------------------------------
drop policy if exists "words_select" on public.words;
drop policy if exists "Enable read access for all users" on public.words;
drop policy if exists "Allow read access for all" on public.words;
drop policy if exists "Allow read for all users" on public.words;
drop policy if exists "words_insert" on public.words;
drop policy if exists "words_update" on public.words;
drop policy if exists "words_delete" on public.words;
drop policy if exists "Enable insert for authenticated users only" on public.words;
drop policy if exists "Enable update for authenticated users only" on public.words;
drop policy if exists "Enable delete for authenticated users only" on public.words;

create policy "words_select" on public.words
    for select to anon, authenticated
    using (true);

create policy "words_insert" on public.words
    for insert to authenticated
    with check (public.is_admin());

create policy "words_update" on public.words
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "words_delete" on public.words
    for delete to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------
-- RLS Policies: admins
-- SELECT only where user_id = auth.uid(). No client writes.
-- ------------------------------------------------------------
drop policy if exists "admins_select" on public.admins;
create policy "admins_select" on public.admins
    for select to authenticated
    using (user_id = auth.uid());

-- ------------------------------------------------------------
-- RLS Policies: users
-- SELECT own row. INSERT own row (user_id = auth.uid()). UPDATE own row. No DELETE from client.
-- ------------------------------------------------------------
drop policy if exists "users_select" on public.users;
create policy "users_select" on public.users
    for select to authenticated
    using (user_id = auth.uid());

drop policy if exists "users_insert" on public.users;
create policy "users_insert" on public.users
    for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists "users_update" on public.users;
create policy "users_update" on public.users
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- RLS Policies: quiz_history
-- SELECT own rows. INSERT own rows (user_id = auth.uid()). No UPDATE or DELETE from client.
-- ------------------------------------------------------------
drop policy if exists "quiz_history_select" on public.quiz_history;
create policy "quiz_history_select" on public.quiz_history
    for select to authenticated
    using (user_id = auth.uid());

drop policy if exists "quiz_history_insert" on public.quiz_history;
create policy "quiz_history_insert" on public.quiz_history
    for insert to authenticated
    with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 6. Permissions / Grants
-- Grant anon no write access on any table.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- words grants
grant select on table public.words to anon, authenticated;
grant insert, update, delete on table public.words to authenticated;
revoke insert, update, delete on table public.words from anon;

-- admins grants: authenticated can select; anon has no access
grant select on table public.admins to authenticated;
revoke all on table public.admins from anon;
revoke insert, update, delete on table public.admins from authenticated;

-- users grants: authenticated can select, insert, update; no delete; anon has no access
grant select, insert, update on table public.users to authenticated;
revoke all on table public.users from anon;
revoke delete on table public.users from authenticated;

-- quiz_history grants: authenticated can select, insert; no update/delete; anon has no access
grant select, insert on table public.quiz_history to authenticated;
revoke all on table public.quiz_history from anon;
revoke update, delete on table public.quiz_history from authenticated;

-- is_admin() function grant
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Example: Make the owner an admin
-- ------------------------------------------------------------
-- insert into admins (user_id) values ('<your-auth-user-id>');
