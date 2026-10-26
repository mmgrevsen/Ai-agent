-- Starting load for a template exercise while it has no recorded history
-- (app schema 2). Additive and nullable: existing rows are unchanged.
alter table public.template_exercises
  add column if not exists start_weight_kg double precision
  check (start_weight_kg is null or (start_weight_kg >= 0 and start_weight_kg <= 1000));
