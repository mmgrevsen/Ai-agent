-- Assertions for row-level security, ownership checks and sync semantics.
-- Each block raises an exception on failure.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- User A creates a workout chain and a custom exercise.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.exercises (id, user_id, name, primary_muscle, pattern, is_custom)
  values ('a-custom', '00000000-0000-0000-0000-00000000000a', 'Sled push', 'quads', 'squat', true);
insert into public.workouts (id, name, started_at, updated_at)
  values ('10000000-0000-0000-0000-000000000001', 'Legs', now(), '2026-10-01T10:00:00Z');
insert into public.workout_exercises (id, workout_id, exercise_id, position)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'barbell-back-squat', 0);
insert into public.workout_sets (id, workout_exercise_id, position, weight_kg, reps, completed)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0, 100, 5, true);
insert into public.profiles (display_name) values ('A');
reset role;

do $$ begin
  if (select user_id from public.workouts where id = '10000000-0000-0000-0000-000000000001') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'user_id should default to auth.uid()';
  end if;
end $$;

-- User B sees nothing of A's, but does see the global library.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.workouts) <> 0 then raise exception 'B can read A''s workouts'; end if;
  if (select count(*) from public.workout_sets) <> 0 then raise exception 'B can read A''s sets'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'B can read A''s profile'; end if;
  if (select count(*) from public.exercises where id = 'a-custom') <> 0 then raise exception 'B can read A''s custom exercise'; end if;
  if (select count(*) from public.exercises where user_id is null) < 70 then raise exception 'global library not readable'; end if;
end $$;

-- B cannot write rows owned by A.
do $$ begin
  begin
    insert into public.workouts (id, user_id, name, started_at)
      values ('10000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000000a', 'Spoof', now());
    raise exception 'B inserted a row for A';
  exception when insufficient_privilege then null; -- RLS violation (42501)
  end;
end $$;

-- B cannot attach its rows to A's workout (composite FK enforces same owner).
do $$ begin
  insert into public.workouts (id, name, started_at) values ('10000000-0000-0000-0000-0000000000b1', 'B workout', now());
  begin
    insert into public.workout_exercises (id, workout_id, exercise_id, position)
      values ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'barbell-back-squat', 0);
    raise exception 'B referenced A''s workout';
  exception when foreign_key_violation then null;
  end;
  -- …or to A's custom exercise.
  begin
    insert into public.workout_exercises (id, workout_id, exercise_id, position)
      values ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b1', 'a-custom', 0);
    raise exception 'B referenced A''s custom exercise';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B cannot modify or delete A's rows or the global library (0 rows affected).
do $$
declare n int;
begin
  update public.workouts set name = 'hacked' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A''s workout'; end if;
  update public.exercises set name = 'hacked' where id = 'barbell-back-squat';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated the global library'; end if;
  delete from public.workout_sets;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A''s sets'; end if;
end $$;
reset role;

-- Last write wins + server clock.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  select server_updated_at into before_ts from public.workouts where id = '10000000-0000-0000-0000-000000000001';
  -- Stale edit (older updated_at) is ignored.
  update public.workouts set name = 'stale', updated_at = '2026-09-01T00:00:00Z' where id = '10000000-0000-0000-0000-000000000001';
  if (select name from public.workouts where id = '10000000-0000-0000-0000-000000000001') <> 'Legs' then
    raise exception 'stale update was applied';
  end if;
  -- Newer edit is applied and bumps the server clock.
  update public.workouts set name = 'Leg day', updated_at = '2026-10-02T00:00:00Z' where id = '10000000-0000-0000-0000-000000000001';
  select server_updated_at into after_ts from public.workouts where id = '10000000-0000-0000-0000-000000000001';
  if (select name from public.workouts where id = '10000000-0000-0000-0000-000000000001') <> 'Leg day' then
    raise exception 'newer update was not applied';
  end if;
  if after_ts <= before_ts then raise exception 'server_updated_at did not advance'; end if;
end $$;

-- Idempotent upsert: replaying the same push does not duplicate rows.
insert into public.water_entries (id, date, ml) values ('40000000-0000-0000-0000-000000000001', '2026-10-02', 500)
  on conflict (id) do update set ml = excluded.ml, updated_at = excluded.updated_at;
insert into public.water_entries (id, date, ml) values ('40000000-0000-0000-0000-000000000001', '2026-10-02', 500)
  on conflict (id) do update set ml = excluded.ml, updated_at = excluded.updated_at;
do $$ begin
  if (select count(*) from public.water_entries) <> 1 then raise exception 'upsert duplicated rows'; end if;
end $$;

-- Profile upsert keyed by user (as the client does for singletons).
insert into public.profiles (user_id, display_name, updated_at) values ('00000000-0000-0000-0000-00000000000a', 'Alex', now())
  on conflict (user_id) do update set display_name = excluded.display_name, updated_at = excluded.updated_at;
do $$ begin
  if (select display_name from public.profiles) <> 'Alex' then raise exception 'profile upsert failed'; end if;
end $$;

-- AI quota.
do $$ begin
  if not public.forma_consume_ai_quota('coach', 2) then raise exception 'quota 1 rejected'; end if;
  if not public.forma_consume_ai_quota('coach', 2) then raise exception 'quota 2 rejected'; end if;
  if public.forma_consume_ai_quota('coach', 2) then raise exception 'quota 3 accepted'; end if;
  begin
    perform count(*) from public.ai_usage;
    raise exception 'ai_usage readable by clients';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Anonymous users can't read anything.
set role anon;
do $$ begin
  begin
    perform count(*) from public.workouts;
    raise exception 'anon can read workouts';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Account deletion cascades to all owned rows (global library stays).
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a') <> 0 then raise exception 'workouts not deleted'; end if;
  if (select count(*) from public.workout_sets) <> 0 then raise exception 'sets not deleted'; end if;
  if (select count(*) from public.exercises where id = 'a-custom') <> 0 then raise exception 'custom exercise not deleted'; end if;
  if (select count(*) from public.exercises where user_id is null) < 70 then raise exception 'library deleted'; end if;
end $$;

select 'ALL DATABASE TESTS PASSED' as result;
