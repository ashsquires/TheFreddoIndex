-- All database access goes through the Edge Function. No browser database grants.
create table public.freddo_comments (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index freddo_comments_approved_created on public.freddo_comments (created_at desc, id desc) where status = 'approved';
create index freddo_comments_pending on public.freddo_comments (created_at) where status = 'pending';

create table public.freddo_comment_attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index freddo_comment_attempts_time on public.freddo_comment_attempts (created_at);
create index freddo_comment_attempts_fingerprint_time on public.freddo_comment_attempts (fingerprint, created_at);

alter table public.freddo_comments enable row level security;
alter table public.freddo_comment_attempts enable row level security;
revoke all on public.freddo_comments, public.freddo_comment_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.freddo_comments, public.freddo_comment_attempts to service_role;
revoke all on sequence public.freddo_comment_attempts_id_seq from public, anon, authenticated;
grant usage, select on sequence public.freddo_comment_attempts_id_seq to service_role;

create function public.freddo_list_comments()
returns table (id uuid, display_name text, body text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select id, display_name, body, created_at
  from public.freddo_comments where status = 'approved'
  order by created_at desc, id desc limit 50;
$$;

create function public.freddo_submit_comment(p_display_name text, p_body text, p_fingerprint text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 40
     or p_body is null or char_length(btrim(p_body)) not between 3 and 1000
     or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid comment';
  end if;
  -- Serialize the limit check and insert so concurrent submissions cannot bypass it.
  perform pg_advisory_xact_lock(7462819);
  delete from public.freddo_comment_attempts where created_at < now() - interval '24 hours';
  if (select count(*) from public.freddo_comment_attempts
      where fingerprint = p_fingerprint and created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.freddo_comment_attempts
      where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.freddo_comments where status = 'pending') >= 500 then
    raise exception using errcode = 'P0001', message = 'Comment limit reached';
  end if;
  insert into public.freddo_comment_attempts (fingerprint) values (p_fingerprint);
  insert into public.freddo_comments (display_name, body, status)
    values (btrim(p_display_name), btrim(p_body), 'pending');
end;
$$;

revoke all on function public.freddo_list_comments() from public, anon, authenticated;
revoke all on function public.freddo_submit_comment(text, text, text) from public, anon, authenticated;
grant execute on function public.freddo_list_comments() to service_role;
grant execute on function public.freddo_submit_comment(text, text, text) to service_role;
