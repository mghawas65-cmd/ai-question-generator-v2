-- Production-ready relational schema proposal for the cloud phase.
-- Requires a PostgreSQL provider + authentication layer before activation.

create table if not exists app_user (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists question (
  id uuid primary key,
  owner_id uuid references app_user(id) on delete cascade,
  topic text not null,
  framework text not null,
  jurisdiction text not null,
  standard_as_of date not null,
  type text not null,
  difficulty text not null,
  bloom_level text not null,
  current_version integer not null default 1,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists question_version (
  question_id uuid references question(id) on delete cascade,
  version integer not null,
  question_text text not null,
  choices jsonb not null default '[]'::jsonb,
  answer text not null,
  explanation text not null,
  why_wrong jsonb not null default '[]'::jsonb,
  reference text,
  paragraph_reference text,
  official_source text,
  verified boolean not null default false,
  verification_confidence numeric(4,3) not null default 0,
  verification_notes text,
  generated_model text,
  reviewer_model text,
  created_at timestamptz not null default now(),
  primary key(question_id,version)
);

create table if not exists question_set (
  id uuid primary key,
  owner_id uuid references app_user(id) on delete cascade,
  topic text not null,
  framework text not null,
  jurisdiction text not null,
  standard_as_of date not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists question_set_item (
  set_id uuid references question_set(id) on delete cascade,
  question_id uuid references question(id) on delete cascade,
  ordinal integer not null,
  primary key(set_id,question_id)
);

create table if not exists attempt (
  id uuid primary key,
  owner_id uuid references app_user(id) on delete cascade,
  score numeric(5,2) not null,
  question_count integer not null,
  weakness jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz not null default now()
);

create table if not exists question_report (
  id uuid primary key,
  reporter_id uuid references app_user(id) on delete set null,
  question_id uuid references question(id) on delete set null,
  issue text not null,
  status text not null default 'open' check(status in ('open','reviewed','fixed','rejected')),
  reviewer_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists product_event (
  id bigserial primary key,
  owner_id uuid references app_user(id) on delete set null,
  event_name text not null,
  topic text,
  framework text,
  duration_ms integer,
  success boolean,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_owner_topic on question(owner_id,topic);
create index if not exists idx_question_framework on question(framework,jurisdiction,standard_as_of);
create index if not exists idx_report_status on question_report(status,created_at);
create index if not exists idx_event_name_created on product_event(event_name,created_at);
