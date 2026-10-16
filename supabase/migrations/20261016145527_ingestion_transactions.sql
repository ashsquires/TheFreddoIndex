-- Service-only RPC bridge. JWT and live grant validation happen before this call.
-- Privileged implementation remains in an unexposed schema.
create table freddo_private.ingestion_receipts (
 principal_id uuid not null,
 tool text not null,
 request_key text not null,
 payload jsonb not null,
 receipt jsonb not null,
 created_at timestamptz not null default now(),
 primary key(principal_id,tool,request_key)
);
alter table freddo_private.ingestion_receipts enable row level security;
revoke all on freddo_private.ingestion_receipts from public,anon,authenticated;

create function freddo_private.start_collection(p_principal uuid, args jsonb) returns jsonb language plpgsql set search_path='' as $$
declare policy freddo_private.policy_versions; run freddo_private.collection_runs; slot timestamptz; manifest jsonb;
begin
 select * into strict policy from freddo_private.policy_versions where effective_from<=now() order by effective_from desc,version desc limit 1;
 slot:=(args->>'scheduled_for')::timestamptz;
 if args->>'trigger'='scheduled' then
  if slot <> (((slot at time zone 'Europe/London')::date + policy.collection_time) at time zone 'Europe/London') or slot>now()+interval '5 minutes' then
   raise exception 'VALIDATION_FAILED: scheduled slot';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('freddo-slot:'||slot::text,0));
  select * into run from freddo_private.collection_runs where trigger='scheduled' and scheduled_for=slot;
  if found and run.principal_id<>p_principal then raise exception 'NOT_FOUND'; end if;
  if run.id is null and now()>=(((slot at time zone 'Europe/London')::date+policy.calculation_time) at time zone 'Europe/London') then raise exception 'CUTOFF_REACHED'; end if;
 end if;
 if run.id is null then
  insert into freddo_private.collection_runs(principal_id,idempotency_key,scheduled_for,trigger,collector_version,policy_version_id,chatgpt_run_url)
  values(p_principal,p_principal::text||':'||(args->>'request_key'),slot,args->>'trigger',args->>'collector_version',policy.id,args->>'chatgpt_run_url') returning * into run;
  insert into freddo_private.collection_run_sources(run_id,source_id)
  select run.id,id from freddo_private.retailer_sources where collection_enabled and valid_from<=now() and (valid_to is null or valid_to>now());
 end if;
 select jsonb_agg(to_jsonb(s) order by s.id) into manifest from freddo_private.retailer_sources s join freddo_private.collection_run_sources m on m.source_id=s.id where m.run_id=run.id;
 select * into strict policy from freddo_private.policy_versions where id=run.policy_version_id;
 return jsonb_build_object('run_id',run.id,'status',run.status,'sources',coalesce(manifest,'[]'),'policy_version',to_jsonb(policy),'cutoff_at',((run.uk_run_date+policy.calculation_time) at time zone 'Europe/London'));
end $$;

create function freddo_private.ingest_transaction(p_principal uuid,p_tool text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous freddo_private.ingestion_receipts; result jsonb; response jsonb;
begin
 if p_principal is null or jsonb_typeof(args)<>'object' or args->>'contract_version'<>'1' or coalesce(args->>'request_key','') !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'VALIDATION_FAILED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_principal::text||':'||p_tool||':'||(args->>'request_key'),0));
 select * into previous from freddo_private.ingestion_receipts where principal_id=p_principal and tool=p_tool and request_key=args->>'request_key';
 if found then
  if previous.payload<>args then raise exception 'CONFLICT'; end if;
  return previous.receipt||'{"replayed":true}'::jsonb;
 end if;
 case p_tool
 when 'start_run_v1' then result:=freddo_private.start_collection(p_principal,args);
 when 'record_attempt_v1' then result:=freddo_private.record_attempt(p_principal,args);
 when 'finish_run_v1' then result:=freddo_private.finish_collection(p_principal,args);
 when 'reserve_evidence_v1' then result:=freddo_private.reserve_evidence(p_principal,args);
 when 'prepare_chunk' then result:=freddo_private.commit_evidence(p_principal,args);
 when 'prepare_final' then
  perform freddo_private.assert_upload_open((args->>'reservation_id')::uuid);
  result:=freddo_private.evidence_access(p_principal,(args->>'reservation_id')::uuid);
 when 'commit_chunk' then result:=freddo_private.commit_evidence(p_principal,args);
 when 'commit_final' then result:=freddo_private.commit_evidence(p_principal,args);
 else raise exception 'VALIDATION_FAILED: unknown operation';
 end case;
 response:=jsonb_build_object('contract_version',1,'request_id',gen_random_uuid(),'received_at',now(),'replayed',false,'data',result);
 insert into freddo_private.ingestion_receipts values(p_principal,p_tool,args->>'request_key',args,response,now());
 return response;
end $$;
create function public.freddo_ingest(p_principal uuid,p_tool text,p_args jsonb) returns jsonb
language sql security invoker set search_path='' as $$select freddo_private.ingest_transaction(p_principal,p_tool,p_args)$$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;
revoke all on function public.freddo_ingest(uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema freddo_private to service_role;
grant execute on function freddo_private.ingest_transaction(uuid,text,jsonb) to service_role;
grant execute on function public.freddo_ingest(uuid,text,jsonb) to service_role;

create function freddo_private.record_attempt(p_principal uuid,args jsonb) returns jsonb language plpgsql set search_path='' as $$
declare run freddo_private.collection_runs; source freddo_private.retailer_sources; policy freddo_private.policy_versions;
 attempt_id uuid; observation_id uuid; evidence_id uuid; observation freddo_private.price_observations;
 normal_baseline freddo_private.price_observations; effective_baseline freddo_private.price_observations;
 old_effective integer; new_effective integer; reasons text[]:='{}'; review_state text:='accepted';
begin
 select * into run from freddo_private.collection_runs where id=(args->>'run_id')::uuid and principal_id=p_principal for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if run.status<>'running' then raise exception 'RUN_CLOSED'; end if;
 select * into strict policy from freddo_private.policy_versions where id=run.policy_version_id;
 if run.trigger='scheduled' and now()>=(run.uk_run_date+policy.calculation_time) at time zone 'Europe/London' then raise exception 'CUTOFF_REACHED'; end if;
 select s.* into source from freddo_private.retailer_sources s join freddo_private.collection_run_sources m on m.source_id=s.id where m.run_id=run.id and s.id=(args->>'source_id')::uuid;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from freddo_private.collection_attempts where run_id=run.id and source_id=source.id and attempt_number=(args->>'attempt_number')::int) then raise exception 'CONFLICT'; end if;
 if (args->>'finished_at')::timestamptz>now()+interval '5 minutes' or
   ((args->>'started_at')::timestamptz at time zone 'Europe/London')::date<>run.uk_run_date then raise exception 'VALIDATION_FAILED: attempt time'; end if;
 if (args->>'attempt_number')::int=2 and not exists(select 1 from freddo_private.collection_attempts where run_id=run.id and source_id=source.id and attempt_number=1 and outcome<>'price_observed') then raise exception 'VALIDATION_FAILED: retry requires failed visit'; end if;
 if (args->>'outcome'='price_observed') <> (args ? 'observation' and args->'observation'<>'null'::jsonb) then raise exception 'VALIDATION_FAILED: observation outcome'; end if;
 insert into freddo_private.collection_attempts(run_id,source_id,attempt_number,started_at,finished_at,outcome,http_status,error_code,error_message,final_url,availability,availability_observed_at,evidence_excerpt)
 values(run.id,source.id,(args->>'attempt_number')::int,(args->>'started_at')::timestamptz,(args->>'finished_at')::timestamptz,args->>'outcome',(args->>'http_status')::int,args->>'error_code',args->>'error_message',args->>'final_url',args->>'availability',(args->>'availability_observed_at')::timestamptz,args->>'evidence_excerpt') returning id into attempt_id;
 if args->>'outcome'='price_observed' then
  observation:=jsonb_populate_record(null::freddo_private.price_observations,args->'observation');
  observation.id:=gen_random_uuid(); observation.attempt_id:=attempt_id; observation.revision_number:=1; observation.availability:=args->>'availability'; observation.created_at:=now();
  if observation.pack_count<>source.expected_pack_count or observation.pack_count<>1 then reasons:=array_append(reasons,'pack_mismatch'); end if;
  if observation.weight_g<>source.expected_weight_g then reasons:=array_append(reasons,'weight_mismatch'); end if;
  if observation.source_url<>source.product_url or args->>'final_url'<>source.product_url or observation.product_title !~* 'freddo' or observation.product_title ~* '(caramel|multipack|white chocolate)' then reasons:=array_append(reasons,'product_mismatch'); end if;
  select o.* into normal_baseline from freddo_private.price_observations o join freddo_private.eligible_observations e on e.id=o.id where e.source_id=source.id and o.observed_at<=observation.observed_at and o.normal_price_pence is not null order by o.observed_at desc,o.created_at desc,o.id desc limit 1;
  select o.* into effective_baseline from freddo_private.price_observations o join freddo_private.eligible_observations e on e.id=o.id where e.source_id=source.id and o.observed_at<=observation.observed_at and (o.normal_price_pence is not null or (o.public_offer_price_pence is not null and (o.offer_expires_at is null or o.offer_expires_at>o.observed_at))) order by o.observed_at desc,o.created_at desc,o.id desc limit 1;
  old_effective:=case when effective_baseline.public_offer_price_pence is not null and (effective_baseline.offer_expires_at is null or effective_baseline.offer_expires_at>effective_baseline.observed_at) then effective_baseline.public_offer_price_pence else effective_baseline.normal_price_pence end;
  new_effective:=case when observation.public_offer_price_pence is not null and (observation.offer_expires_at is null or observation.offer_expires_at>observation.observed_at) then observation.public_offer_price_pence else observation.normal_price_pence end;
  if normal_baseline.id is null and effective_baseline.id is null then reasons:=array_append(reasons,'baseline_missing'); end if;
  if abs(observation.normal_price_pence-normal_baseline.normal_price_pence)::numeric*100>normal_baseline.normal_price_pence*policy.price_change_threshold_pct or abs(new_effective-old_effective)::numeric*100>old_effective*policy.price_change_threshold_pct then reasons:=array_append(reasons,'price_movement'); end if;
  if cardinality(array_remove(reasons,'baseline_missing'))>0 then review_state:='quarantined'; end if;
  insert into freddo_private.price_observations(id,attempt_id,observed_at,product_title,source_url,pack_count,weight_g,currency,normal_price_pence,public_offer_price_pence,loyalty_price_pence,offer_conditions,offer_expires_at,offer_expiry_text,loyalty_offer_conditions,loyalty_offer_expires_at,loyalty_offer_expiry_text,price_evidence_text,availability)
  values(observation.id,attempt_id,observation.observed_at,observation.product_title,observation.source_url,observation.pack_count,observation.weight_g,observation.currency,observation.normal_price_pence,observation.public_offer_price_pence,observation.loyalty_price_pence,observation.offer_conditions,observation.offer_expires_at,observation.offer_expiry_text,observation.loyalty_offer_conditions,observation.loyalty_offer_expires_at,observation.loyalty_offer_expiry_text,observation.price_evidence_text,observation.availability) returning id into observation_id;
  insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,reason_codes,actor,policy_version_id,baseline_normal_id,baseline_effective_id)
  values(observation_id,1,review_state,reasons,'validator-v1',policy.id,normal_baseline.id,effective_baseline.id);
 end if;
 insert into freddo_private.screenshot_evidence(attempt_id,observation_id,purpose) values(attempt_id,observation_id,case when observation_id is null then 'diagnostic' else 'observation' end) returning id into evidence_id;
 return jsonb_build_object('attempt_id',attempt_id,'observation_id',observation_id,'evidence_id',evidence_id,'review_state',case when observation_id is not null then review_state end,'reasons',reasons);
end $$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;

create function freddo_private.read_collection(p_principal uuid,p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare run freddo_private.collection_runs; missing jsonb; attempts jsonb; evidence jsonb; observations jsonb; manifest jsonb; prices integer; gaps integer;
begin
 select * into run from freddo_private.collection_runs where id=p_run and principal_id=p_principal;
 if not found then raise exception 'NOT_FOUND'; end if;
 select coalesce(jsonb_agg(source_id),'[]') into missing from freddo_private.collection_run_sources m where run_id=run.id and required and not exists(select 1 from freddo_private.collection_attempts a where a.run_id=m.run_id and a.source_id=m.source_id);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.source_id,a.attempt_number),'[]') into attempts from freddo_private.collection_attempts a where run_id=run.id;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'),count(*) filter(where e.state<>'stored') into evidence,gaps from freddo_private.screenshot_evidence e join freddo_private.collection_attempts a on a.id=e.attempt_id where a.run_id=run.id;
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('review',v.review) order by o.observed_at,o.id),'[]'),count(*) into observations,prices from freddo_private.price_observations o join freddo_private.collection_attempts a on a.id=o.attempt_id left join lateral(select to_jsonb(r) review from freddo_private.observation_reviews r where r.observation_id=o.id order by sequence_number desc limit 1) v on true where a.run_id=run.id;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into manifest from freddo_private.retailer_sources s join freddo_private.collection_run_sources m on m.source_id=s.id where m.run_id=run.id;
 return jsonb_build_object('run_id',run.id,'status',run.status,'trigger',run.trigger,'scheduled_for',run.scheduled_for,'sources',manifest,'missing_sources',missing,'attempts',attempts,'observations',observations,'evidence',evidence,'price_count',prices,'missing_evidence',gaps);
end $$;
create function freddo_private.finish_collection(p_principal uuid,args jsonb) returns jsonb language plpgsql set search_path='' as $$
declare report jsonb;
begin
 perform 1 from freddo_private.collection_runs where id=(args->>'run_id')::uuid and principal_id=p_principal for update;
 report:=freddo_private.read_collection(p_principal,(args->>'run_id')::uuid);
 update freddo_private.collection_runs set status=case when jsonb_array_length(report->'missing_sources')=0 then 'complete' else 'partial' end,finished_at=coalesce(finished_at,now()) where id=(args->>'run_id')::uuid;
 return freddo_private.read_collection(p_principal,(args->>'run_id')::uuid);
end $$;
create function public.freddo_get_run(p_principal uuid,p_run uuid default null,p_slot timestamptz default null) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 return freddo_private.get_collection(p_principal,p_run,p_slot);
end $$;
create function freddo_private.get_collection(p_principal uuid,p_run uuid,p_slot timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare run_id uuid;
begin
 if (p_run is null)=(p_slot is null) then raise exception 'VALIDATION_FAILED'; end if;
 if p_run is not null then run_id:=p_run;
 else select id into run_id from freddo_private.collection_runs where scheduled_for=p_slot and trigger='scheduled' and principal_id=p_principal; end if;
 return freddo_private.read_collection(p_principal,run_id);
end $$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;
revoke all on function public.freddo_get_run(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function freddo_private.get_collection(uuid,uuid,timestamptz) to service_role;
grant execute on function public.freddo_get_run(uuid,uuid,timestamptz) to service_role;

create table freddo_private.evidence_chunks(
 evidence_id uuid not null references freddo_private.screenshot_evidence,
 chunk_index integer not null check(chunk_index between 0 and 106),
 byte_size integer not null check(byte_size between 1 and 49152),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 object_path text not null unique,
 created_at timestamptz not null default now(),
 primary key(evidence_id,chunk_index)
);
alter table freddo_private.evidence_chunks enable row level security;
revoke all on freddo_private.evidence_chunks from public,anon,authenticated;
create function freddo_private.evidence_access(p_principal uuid,p_evidence uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare evidence freddo_private.screenshot_evidence; chunks jsonb;
begin
 select e.* into evidence from freddo_private.screenshot_evidence e join freddo_private.collection_attempts a on a.id=e.attempt_id join freddo_private.collection_runs r on r.id=a.run_id where e.id=p_evidence and r.principal_id=p_principal;
 if not found then raise exception 'NOT_FOUND'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.chunk_index),'[]') into chunks from freddo_private.evidence_chunks c where evidence_id=evidence.id;
 return to_jsonb(evidence)||jsonb_build_object('reservation_id',evidence.id,'chunks',chunks);
end $$;
create function public.freddo_evidence_access(p_principal uuid,p_evidence uuid) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.evidence_access(p_principal,p_evidence)$$;
create function freddo_private.reserve_evidence(p_principal uuid,args jsonb) returns jsonb language plpgsql set search_path='' as $$
declare e freddo_private.screenshot_evidence; run freddo_private.collection_runs; policy freddo_private.policy_versions;
begin
 perform freddo_private.evidence_access(p_principal,(args->>'evidence_id')::uuid);
 perform freddo_private.assert_upload_open((args->>'evidence_id')::uuid);
 select * into strict e from freddo_private.screenshot_evidence where id=(args->>'evidence_id')::uuid for update;
 select r.* into strict run from freddo_private.collection_runs r join freddo_private.collection_attempts a on a.run_id=r.id where a.id=e.attempt_id;
 if e.attempt_id<>(args->>'attempt_id')::uuid or e.observation_id is distinct from (args->>'observation_id')::uuid or e.purpose<>args->>'purpose' or run.id<>(args->>'run_id')::uuid then raise exception 'NOT_FOUND'; end if;
 if e.state in ('stored','expired') then raise exception 'CONFLICT'; end if;
 if e.captured_at is not null and row(e.captured_at,e.mime_type,e.byte_size,e.sha256) is distinct from row((args->>'captured_at')::timestamptz,args->>'mime_type',(args->>'byte_size')::int,args->>'sha256') then raise exception 'CONFLICT'; end if;
 if (args->>'captured_at')::timestamptz>now()+interval '5 minutes' then raise exception 'VALIDATION_FAILED'; end if;
 select * into strict policy from freddo_private.policy_versions where id=run.policy_version_id;
 if args->>'failure_code' is null and (args->>'captured_at' is null or args->>'mime_type' is null or args->>'byte_size' is null or args->>'sha256' is null) then raise exception 'VALIDATION_FAILED'; end if;
 update freddo_private.screenshot_evidence set captured_at=(args->>'captured_at')::timestamptz,mime_type=args->>'mime_type',byte_size=(args->>'byte_size')::int,sha256=args->>'sha256',failure_code=args->>'failure_code',state=case when args->>'failure_code' is null then 'uploading' else 'failed' end,
 object_path=case when args->>'failure_code'='capture_failed' then null else e.purpose||'/'||run.uk_run_date::text||'/'||e.id::text end,
 expires_at=(args->>'captured_at')::timestamptz+make_interval(days=>case when e.purpose='observation' then policy.observation_image_retention_days else policy.diagnostic_image_retention_days end)
 where id=e.id;
 return freddo_private.evidence_access(p_principal,e.id);
end $$;
create function freddo_private.commit_evidence(p_principal uuid,args jsonb) returns jsonb language plpgsql set search_path='' as $$
declare e freddo_private.screenshot_evidence; existing freddo_private.evidence_chunks; path text;
begin
 perform freddo_private.evidence_access(p_principal,(args->>'reservation_id')::uuid);
 perform freddo_private.assert_upload_open((args->>'reservation_id')::uuid);
 select * into strict e from freddo_private.screenshot_evidence where id=(args->>'reservation_id')::uuid for update;
 if e.state not in ('uploading','stored') then raise exception 'CONFLICT'; end if;
 if args->>'operation'='chunk' then
  path:='staging/'||e.id::text||'/'||(args->>'chunk_index');
  select * into existing from freddo_private.evidence_chunks where evidence_id=e.id and chunk_index=(args->>'chunk_index')::int;
  if found then
   if existing.sha256<>args->>'chunk_sha256' or existing.byte_size<>(args->>'byte_size')::int then raise exception 'CONFLICT'; end if;
  else
   if e.state='stored' then raise exception 'CONFLICT'; end if;
   if (select coalesce(sum(byte_size),0) from freddo_private.evidence_chunks where evidence_id=e.id)+(args->>'byte_size')::int>e.byte_size then raise exception 'SIZE_LIMIT'; end if;
   insert into freddo_private.evidence_chunks values(e.id,(args->>'chunk_index')::int,(args->>'byte_size')::int,args->>'chunk_sha256',path,now());
  end if;
 elsif args->>'operation'='stored' then
  if e.sha256<>args->>'sha256' or e.byte_size<>(args->>'total_bytes')::int then raise exception 'HASH_MISMATCH'; end if;
  update freddo_private.screenshot_evidence set state='stored',uploaded_at=coalesce(uploaded_at,now()),failure_code=null,last_error=null where id=e.id;
 else raise exception 'VALIDATION_FAILED'; end if;
 return freddo_private.evidence_access(p_principal,e.id);
end $$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;
revoke all on function public.freddo_evidence_access(uuid,uuid) from public,anon,authenticated;
grant execute on function freddo_private.evidence_access(uuid,uuid) to service_role;
grant execute on function public.freddo_evidence_access(uuid,uuid) to service_role;

create function freddo_private.assert_upload_open(p_evidence uuid) returns void language plpgsql set search_path='' as $$
declare run freddo_private.collection_runs; policy freddo_private.policy_versions;
begin
 select r.* into strict run from freddo_private.collection_runs r join freddo_private.collection_attempts a on a.run_id=r.id join freddo_private.screenshot_evidence e on e.attempt_id=a.id where e.id=p_evidence;
 select * into strict policy from freddo_private.policy_versions where id=run.policy_version_id;
 if run.trigger='scheduled' and now()>=(run.uk_run_date+policy.calculation_time) at time zone 'Europe/London' then raise exception 'CUTOFF_REACHED'; end if;
end $$;
create function freddo_private.lookup_ingestion_receipt(p_principal uuid,p_tool text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous freddo_private.ingestion_receipts;
begin
 select * into previous from freddo_private.ingestion_receipts where principal_id=p_principal and tool=p_tool and request_key=args->>'request_key';
 if not found then return null; end if;
 if previous.payload<>args then raise exception 'CONFLICT'; end if;
 return previous.receipt||'{"replayed":true}'::jsonb;
end $$;
create function public.freddo_lookup_receipt(p_principal uuid,p_tool text,p_args jsonb) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.lookup_ingestion_receipt(p_principal,p_tool,p_args)$$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;
revoke all on function public.freddo_lookup_receipt(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function freddo_private.lookup_ingestion_receipt(uuid,text,jsonb) to service_role;
grant execute on function public.freddo_lookup_receipt(uuid,text,jsonb) to service_role;
create function freddo_private.upload_access(p_principal uuid,p_evidence uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=freddo_private.evidence_access(p_principal,p_evidence);
 perform freddo_private.assert_upload_open(p_evidence);
 return result;
end $$;
create function public.freddo_upload_access(p_principal uuid,p_evidence uuid) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.upload_access(p_principal,p_evidence)$$;
revoke all on function freddo_private.upload_access(uuid,uuid) from public,anon,authenticated;
revoke all on function public.freddo_upload_access(uuid,uuid) from public,anon,authenticated;
grant execute on function freddo_private.upload_access(uuid,uuid) to service_role;
grant execute on function public.freddo_upload_access(uuid,uuid) to service_role;
