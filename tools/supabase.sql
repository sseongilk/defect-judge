-- 불량 판정소 공용 랭킹 (Supabase SQL Editor에 붙여 넣고 Run)
-- 규칙: 누구나 랭킹 읽기 가능, 기록은 submit_score 함수로만 저장
--       각 기기는 무작위 id·비밀값을 가지며, 같은 id의 기록은 비밀값이 맞을 때만 바뀜
--       최고 점수·오늘의 판 점수는 내려가지 않음

create table if not exists public.scores (
  id       uuid primary key,
  secret   text not null,
  nick     text not null check (char_length(nick) between 1 and 8),
  best     integer not null default 0 check (best between 0 and 10000000),
  stage    integer not null default 1 check (stage between 1 and 999),
  at       timestamptz not null default now()
);
alter table public.scores add column if not exists skin smallint not null default 0 check (skin between 0 and 99);
alter table public.scores add column if not exists team text not null default '' check (char_length(team) <= 8);
alter table public.scores add column if not exists day date;
alter table public.scores add column if not exists day_best integer not null default 0 check (day_best between 0 and 10000000);

alter table public.scores enable row level security;

drop policy if exists "모두 읽기" on public.scores;
create policy "모두 읽기" on public.scores for select to anon, authenticated using (true);

-- 비밀값(secret)은 읽을 수 없게 열 단위로만 읽기 허용, 직접 쓰기는 막음
revoke all on public.scores from anon, authenticated;
grant select (id, nick, best, stage, skin, team, day, day_best, at) on public.scores to anon, authenticated;

drop function if exists public.submit_score(uuid, text, text, integer, integer);

-- p_day가 null이면 오늘의 판 기록은 그대로 둠. 이름·팀·꾸미기는 항상 갱신
create or replace function public.submit_score(
  p_id uuid, p_secret text, p_nick text, p_skin integer, p_team text,
  p_best integer, p_stage integer, p_day date, p_day_best integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'bad secret';
  end if;
  insert into scores (id, secret, nick, skin, team, best, stage, day, day_best)
  values (p_id, p_secret, p_nick, coalesce(p_skin, 0), coalesce(p_team, ''),
          coalesce(p_best, 0), coalesce(p_stage, 1), p_day, case when p_day is null then 0 else coalesce(p_day_best, 0) end)
  on conflict (id) do update set
    nick  = excluded.nick,
    skin  = excluded.skin,
    team  = excluded.team,
    best  = greatest(scores.best, excluded.best),
    stage = case when excluded.best > scores.best then excluded.stage else scores.stage end,
    at    = case when excluded.best > scores.best then now() else scores.at end,
    day   = case when excluded.day is null then scores.day
                 when scores.day is null or excluded.day > scores.day then excluded.day
                 else scores.day end,
    day_best = case when excluded.day is null then scores.day_best
                    when scores.day is null or excluded.day > scores.day then excluded.day_best
                    when excluded.day = scores.day then greatest(scores.day_best, excluded.day_best)
                    else scores.day_best end
  where scores.secret = excluded.secret;
end;
$$;

revoke all on function public.submit_score(uuid, text, text, integer, text, integer, integer, date, integer) from public;
grant execute on function public.submit_score(uuid, text, text, integer, text, integer, integer, date, integer) to anon, authenticated;
