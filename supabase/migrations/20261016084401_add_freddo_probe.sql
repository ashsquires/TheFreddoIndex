-- Probe-only authorization. No production price schema or public data access.
create schema if not exists freddo_private;
revoke all on schema freddo_private from public, anon, authenticated;
create table freddo_private.probe_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  enabled boolean not null default false,
  expires_at timestamptz not null,
  primary key (user_id, client_id)
);
alter table freddo_private.probe_access enable row level security;
revoke all on freddo_private.probe_access from public, anon, authenticated;

create function public.freddo_probe_authorized(p_user uuid, p_client text, p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from freddo_private.probe_access a
    join auth.sessions s on s.user_id = a.user_id
    where a.user_id = p_user and a.client_id = p_client and a.enabled
      and a.expires_at > now() and s.id = p_session
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function public.freddo_probe_authorized(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.freddo_probe_authorized(uuid,text,uuid) to service_role;
-- Create private bucket freddo-auth-probes through Storage API/dashboard:
-- file_size_limit 65536, allowed_mime_types ['application/octet-stream'].
-- No storage policies: only this server's service role may access probe objects.

-- Configure this as the Custom Access Token Hook in Authentication > Hooks.
-- Bind approved clients to this resource rather than the generic database audience.
create function public.freddo_probe_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := event->'claims';
begin
  if exists (select 1 from freddo_private.probe_access a
             where a.client_id = coalesce(event->>'client_id', claims->>'client_id')) then
    claims := jsonb_set(claims, '{aud}', '"https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-probe"'::jsonb);
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.freddo_probe_token_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.freddo_probe_token_hook(jsonb) to supabase_auth_admin;
