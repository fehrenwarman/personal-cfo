-- Personal CFO Setup SQL
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor > New Query)

-- 1. Profiles table
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  annual_income_usd numeric default 0,
  annual_income_cad numeric default 0,
  province text default 'BC',
  birth_year int,
  has_kids boolean default false,
  kids_ages integer[] default '{}',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = user_id);


-- 2. Accounts table
create table if not exists public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.accounts enable row level security;

create policy "Users can view own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own accounts"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own accounts"
  on public.accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own accounts"
  on public.accounts for delete
  using (auth.uid() = user_id);


-- 3. Transactions table
create table if not exists public.transactions (
  id uuid default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  description text,
  amount numeric not null,
  currency text default 'CAD',
  category text default 'other',
  mode text default 'personal',
  amount_cad numeric,
  created_at timestamptz default now(),
  primary key (id, user_id)
);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);


-- 4. Settings table
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text,
  updated_at timestamptz default now()
);

alter table public.settings enable row level security;

create policy "Users can view own settings"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.settings for update
  using (auth.uid() = user_id);

create policy "Users can delete own settings"
  on public.settings for delete
  using (auth.uid() = user_id);


-- 5. Chat history table
create table if not exists public.chat_history (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.chat_history enable row level security;

create policy "Users can view own chat history"
  on public.chat_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat history"
  on public.chat_history for insert
  with check (auth.uid() = user_id);

create policy "Users can update own chat history"
  on public.chat_history for update
  using (auth.uid() = user_id);

create policy "Users can delete own chat history"
  on public.chat_history for delete
  using (auth.uid() = user_id);


-- Helper function: auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, data)
  values (new.id, '{
    "tfsa_balance": 0, "tfsa_room": 0,
    "rrsp_balance": 0, "rrsp_room": 0,
    "resp_balance": 0, "resp_room": 0,
    "non_registered": 0,
    "savings_cad": 0,
    "savings_usd": 0
  }'::jsonb)
  on conflict (user_id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.chat_history (user_id, messages)
  values (new.id, '[]'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger fires after a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
