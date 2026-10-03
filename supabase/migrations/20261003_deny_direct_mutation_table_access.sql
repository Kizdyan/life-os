drop policy if exists life_runtime_mutations_deny_authenticated on public.life_runtime_mutations;
create policy life_runtime_mutations_deny_authenticated
  on public.life_runtime_mutations
  for all
  to authenticated
  using (false)
  with check (false);
