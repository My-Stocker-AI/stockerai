-- Onboarding format-intake: capture-and-wait holding pen.
-- When an operator uploads a report we can't parse yet (or selects vendor "Other"),
-- we save the file + who sent it + which system they use, alert Russ, and follow up by email.
create table if not exists public.pending_unrecognized_formats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  account_email text,
  vendor text,
  filename text,
  pdf_url text,
  reason text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists pending_unrecognized_formats_status_idx
  on public.pending_unrecognized_formats (status, created_at desc);

-- The API writes via the service role (bypasses RLS). No anon/authenticated policies are
-- added, so client apps cannot read or write this internal review queue.
alter table public.pending_unrecognized_formats enable row level security;
