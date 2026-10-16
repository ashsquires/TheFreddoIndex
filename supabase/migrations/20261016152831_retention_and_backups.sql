-- Storage bytes are deleted exclusively through the Storage API by the maintenance worker.
create table freddo_private.upload_leases(evidence_id uuid primary key references freddo_private.screenshot_evidence,active_until timestamptz not null);
create table freddo_private.cleanup_objects(
 bucket text not null check(bucket in ('freddo-evidence','freddo-evidence-staging')),path text not null,
 evidence_id uuid references freddo_private.screenshot_evidence,reason text not null,
 state text not null default 'pending' check(state in ('pending','leased','deleted')),
 lease_id uuid,lease_until timestamptz,attempts integer not null default 0,last_error text,deleted_at timestamptz,
 primary key(bucket,path)
);
create table freddo_private.job_runs(
 id uuid primary key default gen_random_uuid(),job text not null check(job in ('maintenance','backup')),
 started_at timestamptz not null default now(),finished_at timestamptz,state text not null default 'running' check(state in ('running','complete','failed')),
 details jsonb not null default '{}'
);
create table freddo_private.maintenance_settings(
 singleton boolean primary key default true check(singleton),storage_allowance_bytes bigint not null check(storage_allowance_bytes>0),
 orphan_grace_hours integer not null default 24 check(orphan_grace_hours>=24),updated_at timestamptz not null default now()
);
insert into freddo_private.maintenance_settings(storage_allowance_bytes) values(1073741824);
do $$ declare t text;begin
 foreach t in array array['upload_leases','cleanup_objects','job_runs','maintenance_settings'] loop
 execute format('alter table freddo_private.%I enable row level security',t);execute format('revoke all on freddo_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create or replace function freddo_private.upload_access(p_principal uuid,p_evidence uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from freddo_private.screenshot_evidence where id=p_evidence for update;
 result:=freddo_private.evidence_access(p_principal,p_evidence);
 perform freddo_private.assert_upload_open(p_evidence);
 if result->>'state' not in ('uploading','stored') or exists(select 1 from freddo_private.cleanup_objects where evidence_id=p_evidence) then raise exception 'CONFLICT'; end if;
 insert into freddo_private.upload_leases values(p_evidence,now()+interval '10 minutes') on conflict(evidence_id) do update set active_until=excluded.active_until;
 return result;
end $$;
create function freddo_private.plan_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare object record;e freddo_private.screenshot_evidence;ref uuid;reason text;grace interval;result jsonb;
begin
 perform pg_advisory_xact_lock(63884231);
 select make_interval(hours=>orphan_grace_hours) into grace from freddo_private.maintenance_settings;
 -- Read Storage metadata only. Never mutate storage.objects directly.
 for object in select bucket_id,name,created_at from storage.objects where bucket_id in ('freddo-evidence','freddo-evidence-staging') order by created_at,name loop
  reason:=null;ref:=null;
  if object.bucket_id='freddo-evidence' then select id into ref from freddo_private.screenshot_evidence where object_path=object.name;
  else select evidence_id into ref from freddo_private.evidence_chunks where object_path=object.name;end if;
  if ref is not null then
   select * into e from freddo_private.screenshot_evidence where id=ref for update;
   if exists(select 1 from freddo_private.upload_leases where evidence_id=ref and active_until>now()) then continue;end if;
   if object.bucket_id='freddo-evidence' and e.state='stored' and e.expires_at<=now() then reason:='retention_expired';
   elsif object.bucket_id='freddo-evidence-staging' and e.state in ('stored','expired') and object.created_at<=now()-grace then reason:='completed_staging';
   elsif e.state in ('reserved','uploading','failed','expired') and greatest(e.created_at,object.created_at)<=now()-grace then reason:='abandoned_upload';end if;
  elsif object.created_at<=now()-grace then
   -- Uploads register a path before writing bytes. Recheck under the same lock used by cleanup.
   if object.bucket_id='freddo-evidence-staging' and object.name ~ '^staging/[0-9a-f-]{36}/[0-9]+$' then
    ref:=split_part(object.name,'/',2)::uuid;
    select * into e from freddo_private.screenshot_evidence where id=ref for update;
    if found then
     if exists(select 1 from freddo_private.upload_leases where evidence_id=ref and active_until>now()) or e.state='uploading' then continue;end if;
    else ref:=null;end if;
   end if;
   reason:='unreferenced_object';
  end if;
  if reason is not null then insert into freddo_private.cleanup_objects(bucket,path,evidence_id,reason) values(object.bucket_id,object.name,ref,reason) on conflict do nothing;end if;
 end loop;
 with selected as(select bucket,path from freddo_private.cleanup_objects where state='pending' or (state='leased' and lease_until<now()) order by bucket,path limit 100 for update skip locked),
 claimed as(update freddo_private.cleanup_objects c set state='leased',lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes',attempts=attempts+1 from selected s where c.bucket=s.bucket and c.path=s.path returning c.*)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;
 -- No bytes exist for these abandoned reservations. Keep the record and its failure provenance.
 update freddo_private.screenshot_evidence target set state='expired',deleted_at=now() where state in ('reserved','uploading','failed') and created_at<=now()-grace
 and not exists(select 1 from freddo_private.upload_leases l where l.evidence_id=target.id and l.active_until>now())
 and not exists(select 1 from storage.objects o where (o.bucket_id='freddo-evidence' and o.name=target.object_path) or (o.bucket_id='freddo-evidence-staging' and o.name like 'staging/'||target.id::text||'/%'));
 return result;
end $$;
create function freddo_private.ack_cleanup(p_bucket text,p_path text,p_lease uuid,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare item freddo_private.cleanup_objects;
begin
 select * into item from freddo_private.cleanup_objects where bucket=p_bucket and path=p_path for update;
 if not found or item.state<>'leased' or item.lease_id<>p_lease or item.lease_until<=now() then raise exception 'CONFLICT';end if;
 update freddo_private.cleanup_objects set state=case when p_error is null then 'deleted' else 'pending' end,last_error=p_error,deleted_at=case when p_error is null then now() end,lease_until=null where bucket=p_bucket and path=p_path;
 if p_error is null and p_bucket='freddo-evidence' and item.evidence_id is not null then
 update freddo_private.screenshot_evidence set state='expired',deleted_at=now() where id=item.evidence_id;
 end if;
end $$;
create function public.freddo_plan_cleanup() returns jsonb language sql security invoker set search_path='' as $$select freddo_private.plan_cleanup()$$;
create function public.freddo_ack_cleanup(p_bucket text,p_path text,p_lease uuid,p_error text) returns void language sql security invoker set search_path='' as $$select freddo_private.ack_cleanup(p_bucket,p_path,p_lease,p_error)$$;
create function freddo_private.job_state(p_job text,p_id uuid,p_state text,p_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if p_id is null then
  update freddo_private.job_runs set state='failed',finished_at=now(),details=jsonb_build_object('error','WORKER_LEASE_EXPIRED') where job=p_job and state='running' and started_at<now()-interval '20 minutes';
  insert into freddo_private.job_runs(job) values(p_job) returning id into result;
 else
  if p_state not in ('complete','failed') then raise exception 'VALIDATION_FAILED';end if;
  update freddo_private.job_runs set state=p_state,finished_at=now(),details=p_details where id=p_id and job=p_job and state='running' returning id into result;
  if result is null then raise exception 'CONFLICT';end if;
 end if;return result;
end $$;
create function public.freddo_job_state(p_job text,p_id uuid,p_state text,p_details jsonb) returns uuid language sql security invoker set search_path='' as $$select freddo_private.job_state(p_job,p_id,p_state,p_details)$$;
create function freddo_private.operations_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storage_bytes',(select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects where bucket_id in ('freddo-evidence','freddo-evidence-staging')),
 'storage_allowance_bytes',(select storage_allowance_bytes from freddo_private.maintenance_settings),
 'cleanup_failures',(select count(*) from freddo_private.cleanup_objects where state<>'deleted' and last_error is not null),
 'last_backup',(select max(finished_at) from freddo_private.job_runs where job='backup' and state='complete'),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from ((select distinct on(job) * from freddo_private.job_runs where state<>'running' order by job,started_at desc) union all (select * from freddo_private.job_runs where state='running' and started_at<now()-interval '20 minutes')) j))
$$;
create function public.freddo_operations_health() returns jsonb language sql stable security invoker set search_path='' as $$select freddo_private.operations_health()$$;
-- Logical export is a consistent SQL statement snapshot. It deliberately excludes credentials,
-- sessions, OAuth grants, upload leases and delivery request payloads.
create function freddo_private.logical_export() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t text;rows jsonb;tables jsonb:='{}';
begin
 foreach t in array array['retailers','products','retailer_sources','policy_versions','collection_runs','collection_run_sources','collection_attempts','price_observations','observation_reviews','screenshot_evidence','alert_incidents','alert_events'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from freddo_private.%I r',t) into rows;tables:=tables||jsonb_build_object(t,rows);
 end loop;
 if to_regclass('freddo_private.index_memberships') is not null then
  foreach t in array array['index_memberships','index_daily_values','index_inputs'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from freddo_private.%I r',t) into rows;tables:=tables||jsonb_build_object(t,rows);
  end loop;
 end if;
 return jsonb_build_object('format_version',1,'project_ref','ectikpmaidqobqfsqife','exported_at',now(),'image_bytes_backed_up',false,'tables',tables,
 'evidence_manifest',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',object_path,'sha256',sha256,'bytes',byte_size,'state',state,'captured_at',captured_at)),'[]') from freddo_private.screenshot_evidence));
end $$;
create function public.freddo_logical_export() returns jsonb language sql stable security invoker set search_path='' as $$select freddo_private.logical_export()$$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='freddo_private' and p.proname in ('plan_cleanup','ack_cleanup','job_state','operations_health','logical_export')) or (n.nspname='public' and p.proname in ('freddo_plan_cleanup','freddo_ack_cleanup','freddo_job_state','freddo_operations_health','freddo_logical_export')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
