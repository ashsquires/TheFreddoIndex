-- Empty by design: production client registration and owner consent are separate
-- from the seven-day probe. No principal receives access merely by migrating.
create table freddo_private.production_access (
 user_id uuid not null references auth.users(id),
 client_id text not null,
 roles text[] not null check(cardinality(roles)>0 and roles <@ array['collector','monitor','operator']::text[]),
 enabled boolean not null default false,
 expires_at timestamptz not null,
 consented_at timestamptz not null,
 primary key(user_id,client_id)
);
alter table freddo_private.production_access enable row level security;
revoke all on freddo_private.production_access from public,anon,authenticated;
create function freddo_private.production_roles(p_user uuid,p_client text,p_session uuid) returns text[] language sql stable security definer set search_path='' as $$
 select coalesce((select a.roles from freddo_private.production_access a join auth.sessions s on s.user_id=a.user_id where a.user_id=p_user and a.client_id=p_client and a.enabled and a.expires_at>now() and s.id=p_session and (s.not_after is null or s.not_after>now())),'{}'::text[]);
$$;
create function public.freddo_production_roles(p_user uuid,p_client text,p_session uuid) returns text[] language sql stable security invoker set search_path='' as $$select freddo_private.production_roles(p_user,p_client,p_session)$$;
revoke all on function freddo_private.production_roles(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.freddo_production_roles(uuid,text,uuid) from public,anon,authenticated;
grant execute on function freddo_private.production_roles(uuid,text,uuid) to service_role;
grant execute on function public.freddo_production_roles(uuid,text,uuid) to service_role;

-- Keep the already configured hook name; production mapping never rewrites probe grants.
create or replace function public.freddo_probe_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=event->'claims'; client text:=coalesce(event->>'client_id',event->'claims'->>'client_id');
begin
 if exists(select 1 from freddo_private.production_access where client_id=client) then
  claims:=jsonb_set(claims,'{aud}','"https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-ingest"'::jsonb);
 elsif exists(select 1 from freddo_private.probe_access where client_id=client) then
  claims:=jsonb_set(claims,'{aud}','"https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-probe"'::jsonb);
 end if;
 return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.freddo_probe_token_hook(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.freddo_probe_token_hook(jsonb) to supabase_auth_admin;
