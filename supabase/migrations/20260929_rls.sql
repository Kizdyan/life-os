alter table public.life_items enable row level security;
alter table public.life_outcomes enable row level security;
alter table public.life_outbox enable row level security;

alter table public.life_items add column if not exists user_id uuid default auth.uid();
alter table public.life_outcomes add column if not exists user_id uuid default auth.uid();
alter table public.life_outbox add column if not exists user_id uuid default auth.uid();

drop policy if exists life_items_owner on public.life_items;
create policy life_items_owner on public.life_items for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists life_outcomes_owner on public.life_outcomes;
create policy life_outcomes_owner on public.life_outcomes for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists life_outbox_owner on public.life_outbox;
create policy life_outbox_owner on public.life_outbox for all using(user_id=auth.uid()) with check(user_id=auth.uid());
