-- 불량 판정소 공용 랭킹 (Supabase SQL Editor에 붙여 넣고 Run)
-- 규칙: 누구나 랭킹 읽기 가능, 기록은 submit_score 함수로만 저장
--       각 기기는 무작위 id·비밀값을 가지며, 같은 id의 기록은 비밀값이 맞을 때만 바뀜
--       최고 점수는 내려가지 않음

create table if not exists public.scores (
  id     uuid primary key,
  secret text not null,
  nick   text not null check (char_length(nick) between 1 and 8),
  best   integer not null check (best between 0 and 10000000),
  stage  integer not null check (stage between 1 and 999),
  at     timestamptz not null default now()
);

alter table public.scores enable row level security;

drop policy if exists "모두 읽기" on public.scores;
create policy "모두 읽기" on public.scores for select to anon, authenticated using (true);

-- 비밀값(secret)은 읽을 수 없게 열 단위로만 읽기 허용, 직접 쓰기는 막음
revoke all on public.scores from anon, authenticated;
grant select (id, nick, best, stage, at) on public.scores to anon, authenticated;

create or replace function public.submit_score(
  p_id uuid, p_secret text, p_nick text, p_best integer, p_stage integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'bad secret';
  end if;
  insert into scores (id, secret, nick, best, stage)
  values (p_id, p_secret, p_nick, p_best, p_stage)
  on conflict (id) do update set
    nick  = excluded.nick,
    best  = greatest(scores.best, excluded.best),
    stage = case when excluded.best > scores.best then excluded.stage else scores.stage end,
    at    = case when excluded.best > scores.best then now() else scores.at end
  where scores.secret = excluded.secret;
end;
$$;

revoke all on function public.submit_score(uuid, text, text, integer, integer) from public;
grant execute on function public.submit_score(uuid, text, text, integer, integer) to anon, authenticated;
