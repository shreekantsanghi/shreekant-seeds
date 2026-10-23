alter function public.set_updated_at() set search_path = public;

revoke execute on function public.notify_order_paid() from public, anon, authenticated;
revoke execute on function public.notify_payment_failed() from public, anon, authenticated;
revoke execute on function public.notify_inventory_state() from public, anon, authenticated;
revoke execute on function public.notify_new_customer() from public, anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_active
  )
  and (
    coalesce(auth.jwt()->>'aal','') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors
      where user_id = auth.uid()
        and status = 'verified'
    )
  );
$$;