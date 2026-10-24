-- Forma schema. Mirrors the app's local (drift) tables so rows sync 1:1.
--
-- Conventions for every user-owned table:
--   * id            client-generated UUID (idempotent upserts)
--   * user_id       owner; defaults to auth.uid(); RLS restricts all access to it
--   * updated_at    client clock; a trigger ignores updates older than the stored row (last write wins)
--   * deleted_at    soft delete so deletions propagate to other devices
--   * server_updated_at  server clock, set by trigger; clients pull rows changed after a cursor
-- Child rows reference parents through (id, user_id) composite keys, so a row
-- can never point at another user's data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers

create or replace function public.forma_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- Last write wins: keep the stored row if the incoming edit is older.
    if new.updated_at is not null and old.updated_at is not null and new.updated_at < old.updated_at then
      return old;
    end if;
    -- Ownership can never change.
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- ---------------------------------------------------------------- user

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('female', 'male', 'unspecified')),
  height_cm double precision check (height_cm between 50 and 260),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary', 'light', 'moderate', 'high')),
  experience text not null default 'intermediate' check (experience in ('beginner', 'intermediate', 'advanced')),
  primary_goal text not null default 'general' check (primary_goal in ('build_strength', 'build_muscle', 'lose_fat', 'maintain', 'general')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  theme_mode text not null default 'dark' check (theme_mode in ('dark', 'light', 'system')),
  nutrition_enabled boolean not null default true,
  calorie_tracking_enabled boolean not null default true,
  weight_tracking_enabled boolean not null default true,
  adaptive_targets_enabled boolean not null default true,
  health_enabled boolean not null default false,
  sync_health_data boolean not null default false,
  coach_enabled boolean not null default true,
  auto_fill_suggestions boolean not null default true,
  default_rest_seconds int not null default 120 check (default_rest_seconds between 0 and 900),
  max_increase_pct double precision not null default 5 check (max_increase_pct between 0 and 20),
  max_increase_upper_kg double precision not null default 2.5 check (max_increase_upper_kg between 0 and 20),
  max_increase_lower_kg double precision not null default 5 check (max_increase_lower_kg between 0 and 30),
  weekly_workout_target int not null default 3 check (weekly_workout_target between 1 and 7),
  water_target_ml int not null default 2500 check (water_target_ml between 0 and 10000),
  dashboard_cards text not null default '[]',
  coach_scopes text not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.user_equipment (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  equipment text not null,
  increment_kg double precision check (increment_kg > 0 and increment_kg <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.exercise_restrictions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('exercise', 'muscle', 'pattern', 'equipment')),
  value text not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  target_value double precision not null,
  unit text,
  exercise_id text,
  target_date date,
  weekly_rate_kg double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.nutrition_targets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal double precision check (kcal between 0 and 10000),
  protein_g double precision check (protein_g >= 0),
  carbs_g double precision check (carbs_g >= 0),
  fat_g double precision check (fat_g >= 0),
  fiber_g double precision check (fiber_g >= 0),
  mode text not null default 'manual' check (mode in ('manual', 'adaptive')),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- training

-- Global library rows have user_id null and is_custom = false (seeded by migration).
create table public.exercises (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  primary_muscle text not null,
  secondary_muscles text not null default '',
  equipment text not null default '',
  pattern text not null,
  mechanic text not null default 'compound',
  tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'bodyweight_reps', 'duration', 'distance_duration', 'weight_distance')),
  instructions text not null default '',
  is_custom boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  constraint exercises_custom_owner check ((is_custom and user_id is not null) or (not is_custom and user_id is null))
);

create table public.workout_templates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.template_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid not null,
  exercise_id text not null references public.exercises (id),
  position int not null,
  superset_group int,
  sets int not null default 3 check (sets between 1 and 20),
  warmup_sets int not null default 0 check (warmup_sets between 0 and 10),
  rep_min int not null default 8 check (rep_min between 1 and 100),
  rep_max int not null default 12 check (rep_max between 1 and 100),
  target_rpe double precision check (target_rpe between 1 and 10),
  rest_seconds int check (rest_seconds between 0 and 900),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (template_id, user_id) references public.workout_templates (id, user_id) on delete cascade,
  check (rep_min <= rep_max)
);

create table public.training_schedules (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  start_date date,
  deload_every_weeks int check (deload_every_weeks between 2 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.schedule_days (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  schedule_id uuid not null,
  weekday int not null check (weekday between 1 and 7),
  template_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (schedule_id, user_id) references public.training_schedules (id, user_id) on delete cascade,
  foreign key (template_id, user_id) references public.workout_templates (id, user_id) on delete cascade
);

create table public.workouts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid,
  name text not null check (char_length(name) <= 120),
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text check (char_length(notes) <= 5000),
  session_rpe double precision check (session_rpe between 1 and 10),
  is_deload boolean not null default false,
  source text not null default 'recorded' check (source in ('recorded', 'imported')),
  external_id text,
  activity_type text,
  energy_kcal double precision check (energy_kcal >= 0),
  distance_m double precision check (distance_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ended_at is null or ended_at >= started_at)
);

create table public.workout_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id uuid not null,
  exercise_id text not null references public.exercises (id),
  position int not null,
  superset_group int,
  rep_min int,
  rep_max int,
  target_rpe double precision,
  rest_seconds int,
  notes text,
  recommendation text,
  substituted_from_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade
);

create table public.workout_sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_exercise_id uuid not null,
  position int not null,
  kind text not null default 'working' check (kind in ('warmup', 'working', 'drop', 'failure')),
  weight_kg double precision check (weight_kg between -500 and 1500),
  reps int check (reps between 0 and 1000),
  duration_s int check (duration_s between 0 and 86400),
  distance_m double precision check (distance_m between 0 and 1000000),
  rpe double precision check (rpe between 1 and 10),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (workout_exercise_id, user_id) references public.workout_exercises (id, user_id) on delete cascade
);

create table public.readiness_checkins (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  energy int not null check (energy between 1 and 5),
  soreness int not null check (soreness between 1 and 5),
  sleep_quality int not null check (sleep_quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- nutrition

create table public.foods (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  brand text,
  source text not null check (source in ('off', 'usda', 'custom', 'ai')),
  source_ref text,
  provenance text not null check (provenance in ('verified', 'community', 'custom', 'aiEstimate')),
  -- Per 100 g. NULL = unknown (never coerced to 0).
  kcal100 double precision check (kcal100 between 0 and 1000),
  protein100 double precision check (protein100 between 0 and 100),
  carbs100 double precision check (carbs100 between 0 and 100),
  fat100 double precision check (fat100 between 0 and 100),
  fiber100 double precision check (fiber100 between 0 and 100),
  serving_g double precision check (serving_g > 0),
  serving_label text,
  favorite boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.food_servings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id uuid not null,
  label text not null,
  grams double precision not null check (grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete cascade
);

create table public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  servings double precision not null default 1 check (servings > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.recipe_ingredients (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null,
  food_id uuid not null,
  grams double precision not null check (grams > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade,
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete cascade
);

create table public.saved_meals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.saved_meal_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null,
  food_id uuid not null,
  grams double precision not null check (grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.saved_meals (id, user_id) on delete cascade,
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete cascade
);

-- Diary lines snapshot nutrients, so they don't reference foods by key.
create table public.nutrition_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid,
  recipe_id uuid,
  name text not null,
  brand text,
  grams double precision check (grams >= 0),
  servings double precision check (servings >= 0),
  serving_label text,
  kcal double precision check (kcal >= 0),
  protein_g double precision check (protein_g >= 0),
  carbs_g double precision check (carbs_g >= 0),
  fat_g double precision check (fat_g >= 0),
  fiber_g double precision check (fiber_g >= 0),
  provenance text not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.water_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  ml int not null check (ml between 0 and 10000),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- body & health

create table public.body_weights (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  measured_at timestamptz not null,
  weight_kg double precision not null check (weight_kg between 20 and 400),
  source text not null default 'recorded' check (source in ('recorded', 'imported')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.body_measurements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('waist', 'chest', 'hips', 'arm', 'thigh', 'neck', 'body_fat')),
  value double precision not null check (value > 0 and value < 300),
  unit text not null check (unit in ('cm', '%')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- Only synced when the user opts in (user_preferences.sync_health_data).
create table public.health_observations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('resting_hr', 'hrv_sdnn', 'heart_rate', 'sleep', 'active_energy', 'steps')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  value double precision not null,
  unit text not null,
  source_name text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- AI

create table public.ai_recommendations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  title text not null,
  explanation text not null,
  payload text,
  source text not null default 'ai' check (source in ('ai', 'engine')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.coach_messages (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- Server-side usage counters for rate limiting AI endpoints. Not readable by clients.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null,
  requests int not null default 0,
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;

-- ---------------------------------------------------------------- triggers, RLS, sync indexes

do $$
declare
  t text;
  owned text[] := array[
    'profiles', 'user_preferences', 'user_equipment', 'exercise_restrictions', 'goals', 'nutrition_targets',
    'exercises', 'workout_templates', 'template_exercises', 'training_schedules', 'schedule_days',
    'workouts', 'workout_exercises', 'workout_sets', 'readiness_checkins',
    'foods', 'food_servings', 'recipes', 'recipe_ingredients', 'saved_meals', 'saved_meal_items',
    'nutrition_entries', 'water_entries', 'body_weights', 'body_measurements', 'health_observations',
    'ai_recommendations', 'coach_messages'
  ];
begin
  foreach t in array owned loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.forma_touch()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create index %I on public.%I (user_id, server_updated_at)', t || '_sync_idx', t);
    if t <> 'exercises' then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    end if;
  end loop;
end $$;

-- Exercises: everyone signed in can read the global library; custom rows are private.
create policy exercises_select on public.exercises for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy exercises_insert_custom on public.exercises for insert to authenticated
  with check (is_custom and user_id = (select auth.uid()));
create policy exercises_update_custom on public.exercises for update to authenticated
  using (is_custom and user_id = (select auth.uid())) with check (is_custom and user_id = (select auth.uid()));
create policy exercises_delete_custom on public.exercises for delete to authenticated
  using (is_custom and user_id = (select auth.uid()));

-- References to exercises must be to the global library or the user's own custom exercise.
create or replace function public.forma_check_exercise_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.exercises e
    where e.id = new.exercise_id and (e.user_id is null or e.user_id = new.user_id)
  ) then
    raise exception 'exercise % is not accessible', new.exercise_id using errcode = '42501';
  end if;
  return new;
end $$;

create trigger template_exercises_exercise_access before insert or update of exercise_id on public.template_exercises
  for each row execute function public.forma_check_exercise_access();
create trigger workout_exercises_exercise_access before insert or update of exercise_id on public.workout_exercises
  for each row execute function public.forma_check_exercise_access();

-- Query indexes for the app's main access paths.
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id);
create index workout_exercises_user_exercise_idx on public.workout_exercises (user_id, exercise_id);
create index workout_sets_we_idx on public.workout_sets (workout_exercise_id);
create index template_exercises_template_idx on public.template_exercises (template_id);
create index nutrition_entries_user_date_idx on public.nutrition_entries (user_id, date);
create index water_entries_user_date_idx on public.water_entries (user_id, date);
create index body_weights_user_date_idx on public.body_weights (user_id, date);
create index health_observations_user_type_idx on public.health_observations (user_id, type, start_at);
-- Not unique: two devices may import the same Apple Health sample under different local ids.
create index health_observations_external_idx on public.health_observations (user_id, external_id) where external_id is not null;
create index foods_user_source_ref_idx on public.foods (user_id, source, source_ref);
create index coach_messages_thread_idx on public.coach_messages (user_id, thread_id, created_at);
create index ai_recommendations_user_status_idx on public.ai_recommendations (user_id, status);

-- ---------------------------------------------------------------- functions

-- Atomically counts an AI request for the caller and reports whether it is
-- within the daily limit. Called by Edge Functions with the user's JWT.
create or replace function public.forma_consume_ai_quota(p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  used int;
begin
  if uid is null then
    return false;
  end if;
  insert into public.ai_usage as u (user_id, day, kind, requests)
  values (uid, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set requests = u.requests + 1
  returning requests into used;
  return used <= p_limit;
end $$;

revoke all on function public.forma_consume_ai_quota(text, int) from public, anon;
grant execute on function public.forma_consume_ai_quota(text, int) to authenticated;

-- Least privilege: only signed-in users reach tables, and only through RLS.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.ai_usage from authenticated;
