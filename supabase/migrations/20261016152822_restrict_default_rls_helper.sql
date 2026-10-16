-- Supabase's default DDL event trigger remains active. Browser/API users
-- do not need permission to call its privileged helper directly.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
