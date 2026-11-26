-- 1. Contracts table
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null check (category in ('rental', 'freelance', 'loan', 'privacy_policy', 'employment', 'other')),
  overall_risk_score integer not null check (overall_risk_score >= 0 and overall_risk_score <= 100),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  summary text not null,
  created_at timestamptz not null default now()
);

-- 2. Clauses table
create table if not exists public.clauses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clause_title text not null,
  original_text text not null,
  severity text not null check (severity in ('safe', 'caution', 'red_flag')),
  plain_english text not null,
  hidden_risk text,
  suggested_counter_clause text,
  created_at timestamptz not null default now()
);

-- 3. Indexes for fast lookups
/*
add indexes on user_id and created_at for contracts, and on contract_id and user_id for clauses to optimize query performance.
when user fetches their contracts or clauses, the database can quickly locate the relevant records without scanning the entire table.
*/
create index if not exists idx_contracts_user_id on public.contracts(user_id, created_at desc);
create index if not exists idx_clauses_contract_id on public.clauses(contract_id);
create index if not exists idx_clauses_user_id on public.clauses(user_id);

-- 4. Enable Row-Level Security
/*
prevents unauthorized access to contracts and clauses by ensuring that users can only access their 
own data based on the policies defined below. 
*/
alter table public.contracts enable row level security;
alter table public.clauses enable row level security;

-- 5. Grant access to authenticated users
/*
Allowing the user to perform select, insert, update, and delete operations 
on their own contracts and clauses while restricting access to other users' data.
*/
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contracts to authenticated;
grant select, insert, update, delete on public.clauses to authenticated;

-- 6. RLS Policies for contracts
/*
defining policies that restrict users to only view, insert, and delete their own contracts based on their user_id.
*/
create policy "Users can view their own contracts"
  on public.contracts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own contracts"
  on public.contracts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own contracts"
  on public.contracts for delete
  to authenticated
  using (auth.uid() = user_id);

-- 7. RLS Policies for clauses
create policy "Users can view their own clauses"
  on public.clauses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own clauses"
  on public.clauses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own clauses"
  on public.clauses for delete
  to authenticated
  using (auth.uid() = user_id);