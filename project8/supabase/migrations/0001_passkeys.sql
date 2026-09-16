-- 과제 8: 패스키(WebAuthn) 인증용 스키마
-- 이 파일은 Supabase 프로젝트에 supabase db push 로 적용합니다.

-- 1) 핸들(계정 식별용 이름) <-> auth.users 매핑
--    비밀번호가 없으므로, 로그인 시작 단계에서 "누구의 자격증명으로 challenge를 만들지" 찾는 용도로만 씀.
--    핸들 자체는 비밀값이 아니다 (아이디일 뿐, 이것만으로는 아무것도 못 함).
create table if not exists public.passkey_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  created_at timestamptz not null default now()
);

-- 2) 패스키 자격증명 (공개키만 저장 — 개인키는 절대 여기 없음)
create table if not exists public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,       -- base64url, WebAuthn credential ID
  public_key text not null,                 -- base64url로 인코딩한 COSE 공개키
  counter bigint not null default 0,        -- 서명 재사용(복제) 탐지용 카운터
  device_name text not null,                -- 사람이 알아보는 이름 (예: "내 노트북")
  created_at timestamptz not null default now()
);

-- 3) 챌린지 (등록/로그인 각각 1회용, 서버에서만 접근 — RLS로 클라이언트 직접 접근 차단)
create table if not exists public.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  pending_handle text,                      -- 신규 계정 등록 중일 때만 사용 (아직 user_id가 없음)
  pending_device_name text,                 -- 신규 등록 중 저장할 기기 이름
  user_id uuid references auth.users(id) on delete cascade,  -- 기존 계정 로그인/추가등록이면 채워짐
  challenge text not null,
  type text not null check (type in ('register', 'login')),
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 4) 비공개 자료 (심사 기준 T08-C14: 항목 3개 이상)
create table if not exists public.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.passkey_accounts enable row level security;
alter table public.passkey_credentials enable row level security;
alter table public.passkey_challenges enable row level security;
alter table public.private_notes enable row level security;

-- passkey_accounts: 본인 것만 읽기 (핸들 중복 확인은 Edge Function이 service_role로 처리)
drop policy if exists "select own account" on public.passkey_accounts;
create policy "select own account" on public.passkey_accounts
  for select using (auth.uid() = user_id);

-- passkey_credentials: 본인 것만 조회/삭제. INSERT/UPDATE는 Edge Function(service_role)만 함.
drop policy if exists "select own credentials" on public.passkey_credentials;
create policy "select own credentials" on public.passkey_credentials
  for select using (auth.uid() = user_id);

drop policy if exists "delete own credentials" on public.passkey_credentials;
create policy "delete own credentials" on public.passkey_credentials
  for delete using (auth.uid() = user_id);

-- passkey_challenges: 클라이언트(anon/authenticated)는 아예 접근 불가. 정책을 하나도 안 만들면
-- RLS가 켜진 상태에서 기본적으로 전부 거부된다. Edge Function은 service_role 키를 쓰므로 RLS를 우회함.

-- private_notes: 본인 것만 CRUD
drop policy if exists "select own notes" on public.private_notes;
create policy "select own notes" on public.private_notes
  for select using (auth.uid() = user_id);

drop policy if exists "insert own notes" on public.private_notes;
create policy "insert own notes" on public.private_notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own notes" on public.private_notes;
create policy "update own notes" on public.private_notes
  for update using (auth.uid() = user_id);

drop policy if exists "delete own notes" on public.private_notes;
create policy "delete own notes" on public.private_notes
  for delete using (auth.uid() = user_id);

-- 만료된 챌린지 청소용 (선택 실행 — cron 없이 그냥 참고용 함수)
create or replace function public.cleanup_expired_challenges()
returns void
language sql
as $$
  delete from public.passkey_challenges
  where expires_at < now() - interval '1 day';
$$;
