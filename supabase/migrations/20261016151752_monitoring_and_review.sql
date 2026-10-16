create table freddo_private.alert_incidents(
 id uuid primary key default gen_random_uuid(),
 uk_date date not null,
 category text not null,
 source_id uuid references freddo_private.retailer_sources,
 condition_key text not null unique,
 generation integer not null default 1,
 active boolean not null default true,
 summary text not null,
 opened_at timestamptz not null default now(),
 resolved_at timestamptz
);
create table freddo_private.alert_events(
 id uuid primary key default gen_random_uuid(),
 incident_id uuid not null references freddo_private.alert_incidents,
 generation integer not null,
 kind text not null check(kind in ('failure','recovery')),
 summary text not null,
 state text not null default 'pending' check(state in ('pending','leased','accepted','delivered','failed')),
 lease_id uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 unique(incident_id,generation,kind)
);
create index alert_delivery_queue on freddo_private.alert_events(state,next_attempt_at);
alter table freddo_private.alert_incidents enable row level security;
alter table freddo_private.alert_events enable row level security;
revoke all on freddo_private.alert_incidents,freddo_private.alert_events from public,anon,authenticated;
create function freddo_private.reconcile_alerts(p_date date,conditions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; incident freddo_private.alert_incidents; key text; seen text[]:='{}';
begin
 if jsonb_typeof(conditions)<>'array' then raise exception 'VALIDATION_FAILED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('health:'||p_date::text,0));
 for item in select value from jsonb_array_elements(conditions) loop
  key:=p_date::text||':'||(item->>'category')||':'||coalesce(item->>'source_id','none');seen:=array_append(seen,key);
  select * into incident from freddo_private.alert_incidents where condition_key=key for update;
  if not found then
   insert into freddo_private.alert_incidents(uk_date,category,source_id,condition_key,summary) values(p_date,item->>'category',(item->>'source_id')::uuid,key,item->>'summary') returning * into incident;
   insert into freddo_private.alert_events(incident_id,generation,kind,summary) values(incident.id,incident.generation,'failure',incident.summary);
  elsif not incident.active or incident.summary is distinct from item->>'summary' then
   update freddo_private.alert_incidents set active=true,generation=generation+1,summary=item->>'summary',opened_at=now(),resolved_at=null where id=incident.id returning * into incident;
   insert into freddo_private.alert_events(incident_id,generation,kind,summary) values(incident.id,incident.generation,'failure',incident.summary);
  end if;
 end loop;
 for incident in select * from freddo_private.alert_incidents where uk_date=p_date and active and not(condition_key=any(seen)) for update loop
  update freddo_private.alert_incidents set active=false,resolved_at=now() where id=incident.id;
  insert into freddo_private.alert_events(incident_id,generation,kind,summary) values(incident.id,incident.generation,'recovery','Recovered: '||incident.summary) on conflict do nothing;
 end loop;
 return (select coalesce(jsonb_agg(to_jsonb(i)),'[]') from freddo_private.alert_incidents i where uk_date=p_date);
end $$;
create function public.freddo_reconcile_alerts(p_date date,p_conditions jsonb) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.reconcile_alerts(p_date,p_conditions)$$;
revoke all on function freddo_private.reconcile_alerts(date,jsonb) from public,anon,authenticated;
revoke all on function public.freddo_reconcile_alerts(date,jsonb) from public,anon,authenticated;
grant execute on function freddo_private.reconcile_alerts(date,jsonb),public.freddo_reconcile_alerts(date,jsonb) to service_role;

create function freddo_private.claim_alerts(p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit not between 1 and 20 then raise exception 'VALIDATION_FAILED'; end if;
 update freddo_private.alert_events set state='failed',last_error='DELIVERY_OUTCOME_UNKNOWN' where state in ('pending','leased') and first_attempt_at<=now()-interval '23 hours';
 with selected as(select id from freddo_private.alert_events where (state='pending' or (state='leased' and lease_until<now())) and next_attempt_at<=now() order by created_at,id limit p_limit for update skip locked),
 claimed as(update freddo_private.alert_events e set state='leased',lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) from selected s where e.id=s.id returning e.*)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;
 return result;
end $$;
create function freddo_private.ack_alert(p_event uuid,p_lease uuid,p_provider text,p_error text) returns jsonb language plpgsql security definer set search_path='' as $$
declare event freddo_private.alert_events;
begin
 select * into event from freddo_private.alert_events where id=p_event for update;
 if not found or event.state<>'leased' or event.lease_id<>p_lease or event.lease_until<=now() then raise exception 'CONFLICT'; end if;
 if (p_provider is null)=(p_error is null) then raise exception 'VALIDATION_FAILED'; end if;
 update freddo_private.alert_events set state=case when p_provider is not null then 'accepted' when attempts>=5 then 'failed' else 'pending' end,provider_id=p_provider,last_error=p_error,accepted_at=case when p_provider is not null then now() end,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempts)::int*30)) where id=p_event returning * into event;
 return to_jsonb(event);
end $$;
create function public.freddo_claim_alerts(p_limit integer) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.claim_alerts(p_limit)$$;
create function public.freddo_ack_alert(p_event uuid,p_lease uuid,p_provider text,p_error text) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.ack_alert(p_event,p_lease,p_provider,p_error)$$;
revoke all on function freddo_private.claim_alerts(integer),freddo_private.ack_alert(uuid,uuid,text,text),public.freddo_claim_alerts(integer),public.freddo_ack_alert(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function freddo_private.claim_alerts(integer),freddo_private.ack_alert(uuid,uuid,text,text),public.freddo_claim_alerts(integer),public.freddo_ack_alert(uuid,uuid,text,text) to service_role;

create function freddo_private.health_snapshot(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare run freddo_private.collection_runs; policy freddo_private.policy_versions; sources jsonb; attempts jsonb; evidence jsonb; reviews jsonb; grants jsonb;
begin
 select * into run from freddo_private.collection_runs where uk_run_date=p_date and trigger='scheduled';
 if run.id is not null then select * into strict policy from freddo_private.policy_versions where id=run.policy_version_id;
 else select * into strict policy from freddo_private.policy_versions where effective_from<=(p_date+time '10:00') at time zone 'Europe/London' order by effective_from desc,version desc limit 1; end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into sources from freddo_private.retailer_sources s where
 (run.id is not null and exists(select 1 from freddo_private.collection_run_sources m where m.run_id=run.id and m.source_id=s.id)) or
 (run.id is null and s.collection_enabled and s.valid_from<=(p_date+policy.collection_time) at time zone 'Europe/London' and (s.valid_to is null or s.valid_to>(p_date+policy.collection_time) at time zone 'Europe/London'));
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into attempts from freddo_private.collection_attempts a where run_id=run.id;
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into evidence from freddo_private.screenshot_evidence e join freddo_private.collection_attempts a on a.id=e.attempt_id where a.run_id=run.id;
 select coalesce(jsonb_agg(jsonb_build_object('attempt_id',o.attempt_id,'observation_id',o.id,'decision',v.decision)),'[]') into reviews from freddo_private.price_observations o join freddo_private.collection_attempts a on a.id=o.attempt_id join lateral(select decision from freddo_private.observation_reviews r where r.observation_id=o.id order by sequence_number desc limit 1) v on true where a.run_id=run.id and not exists(select 1 from freddo_private.price_observations child where child.supersedes_observation_id=o.id);
 select coalesce(jsonb_agg(jsonb_build_object('enabled',enabled,'expires_at',expires_at)),'[]') into grants from freddo_private.production_access where 'collector'=any(roles);
 return jsonb_build_object('uk_date',p_date,'server_now',now(),'deadline',(p_date+policy.calculation_time) at time zone 'Europe/London','run',case when run.id is not null then to_jsonb(run) end,'sources',sources,'attempts',attempts,'evidence',evidence,'reviews',reviews,'grants',grants,'policy',to_jsonb(policy),'stock_history',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from freddo_private.collection_attempts a join freddo_private.collection_runs r on r.id=a.run_id where r.trigger<>'synthetic' and a.availability_observed_at<=now()));
end $$;
create function public.freddo_health_snapshot(p_date date) returns jsonb language sql stable security invoker set search_path='' as $$select freddo_private.health_snapshot(p_date)$$;
revoke all on function freddo_private.health_snapshot(date),public.freddo_health_snapshot(date) from public,anon,authenticated;
grant execute on function freddo_private.health_snapshot(date),public.freddo_health_snapshot(date) to service_role;

create table freddo_private.operator_access(user_id uuid primary key references auth.users(id),enabled boolean not null default true,expires_at timestamptz not null,created_at timestamptz not null default now());
alter table freddo_private.operator_access enable row level security;
revoke all on freddo_private.operator_access from public,anon,authenticated;
create function freddo_private.operator_authorized(p_user uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from freddo_private.operator_access a join auth.sessions s on s.user_id=a.user_id where a.user_id=p_user and a.enabled and a.expires_at>now() and s.id=p_session and (s.not_after is null or s.not_after>now()));
$$;
create function public.freddo_operator_authorized(p_user uuid,p_session uuid) returns boolean language sql stable security invoker set search_path='' as $$select freddo_private.operator_authorized(p_user,p_session)$$;
create function freddo_private.operator_action(p_user uuid,p_action text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare observation freddo_private.price_observations; review freddo_private.observation_reviews; result jsonb; receipt jsonb; key text; new_id uuid; changed freddo_private.price_observations;
begin
 if not exists(select 1 from freddo_private.operator_access where user_id=p_user and enabled and expires_at>now()) then raise exception 'FORBIDDEN'; end if;
 if p_action='snapshot' then
  return jsonb_build_object('server_now',now(),'policy',(select to_jsonb(p) from freddo_private.policy_versions p where effective_from<=now() order by effective_from desc,version desc limit 1),
   'retailers',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from freddo_private.retailers r),
   'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from freddo_private.retailer_sources s),
   'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]') from (select * from freddo_private.collection_runs order by started_at desc limit 60) r),
   'attempts',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from freddo_private.collection_attempts a join freddo_private.collection_runs r on r.id=a.run_id where r.trigger<>'synthetic'),
   'observations',(select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('review',v.review) order by o.observed_at desc),'[]') from (select o.*,a.source_id from freddo_private.price_observations o join freddo_private.collection_attempts a on a.id=o.attempt_id join freddo_private.collection_runs r on r.id=a.run_id where r.trigger<>'synthetic' and (o.observed_at>now()-interval '31 days' or (select decision from freddo_private.observation_reviews where observation_id=o.id order by sequence_number desc limit 1) in ('pending','quarantined')) order by o.observed_at desc) o left join lateral(select to_jsonb(v) review from freddo_private.observation_reviews v where v.observation_id=o.id order by sequence_number desc limit 1) v on true),
   'evidence',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from freddo_private.screenshot_evidence e where state<>'expired'),
   'alerts',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from (select * from freddo_private.alert_events order by created_at desc limit 100) e));
 end if;
 if p_action='evidence' then
  select to_jsonb(e) into result from freddo_private.screenshot_evidence e where id=(args->>'evidence_id')::uuid and state='stored';
  if result is null then raise exception 'NOT_FOUND'; end if;return result;
 end if;
 key:=args->>'request_key';
 if coalesce(key,'') !~ '^[A-Za-z0-9_-]{1,80}$' or length(trim(coalesce(args->>'reason','')))=0 then raise exception 'VALIDATION_FAILED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':operator:'||p_action||':'||key,0));
 receipt:=freddo_private.lookup_ingestion_receipt(p_user,'operator_'||p_action,args);
 if receipt is not null then return receipt; end if;
 select * into observation from freddo_private.price_observations where id=(args->>'observation_id')::uuid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into review from freddo_private.observation_reviews where observation_id=observation.id order by sequence_number desc limit 1;
 if review.sequence_number<>(args->>'expected_sequence')::int or exists(select 1 from freddo_private.price_observations where supersedes_observation_id=observation.id) then raise exception 'CONFLICT'; end if;
 if p_action='review' then
  if args->>'decision' not in ('accepted','rejected') then raise exception 'VALIDATION_FAILED'; end if;
  insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,reason_codes,note,actor,policy_version_id) values(observation.id,review.sequence_number+1,args->>'decision',array['operator_review'],args->>'reason',p_user::text,review.policy_version_id) returning to_jsonb(observation_reviews) into result;
 elsif p_action='correct' then
  changed:=jsonb_populate_record(observation,args->'changes');new_id:=gen_random_uuid();
  insert into freddo_private.price_observations(id,attempt_id,revision_number,supersedes_observation_id,correction_reason,observed_at,product_title,source_url,pack_count,weight_g,currency,normal_price_pence,public_offer_price_pence,loyalty_price_pence,offer_conditions,offer_expires_at,offer_expiry_text,loyalty_offer_conditions,loyalty_offer_expires_at,loyalty_offer_expiry_text,price_evidence_text,availability)
  values(new_id,observation.attempt_id,observation.revision_number+1,observation.id,args->>'reason',observation.observed_at,observation.product_title,observation.source_url,changed.pack_count,changed.weight_g,'GBP',changed.normal_price_pence,changed.public_offer_price_pence,changed.loyalty_price_pence,changed.offer_conditions,changed.offer_expires_at,changed.offer_expiry_text,changed.loyalty_offer_conditions,changed.loyalty_offer_expires_at,changed.loyalty_offer_expiry_text,changed.price_evidence_text,observation.availability);
  insert into freddo_private.observation_reviews(observation_id,sequence_number,decision,reason_codes,note,actor,policy_version_id) values(observation.id,review.sequence_number+1,'superseded',array['operator_correction'],args->>'reason',p_user::text,review.policy_version_id),(new_id,1,'accepted',array['operator_correction'],args->>'reason',p_user::text,review.policy_version_id);
  result:=jsonb_build_object('observation_id',new_id,'supersedes_observation_id',observation.id);
 else raise exception 'VALIDATION_FAILED'; end if;
 receipt:=jsonb_build_object('request_id',gen_random_uuid(),'received_at',now(),'replayed',false,'data',result);
 insert into freddo_private.ingestion_receipts values(p_user,'operator_'||p_action,key,args,receipt,now());return receipt;
end $$;
create function public.freddo_operator(p_user uuid,p_action text,p_args jsonb) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.operator_action(p_user,p_action,p_args)$$;
revoke all on function freddo_private.operator_authorized(uuid,uuid),public.freddo_operator_authorized(uuid,uuid),freddo_private.operator_action(uuid,text,jsonb),public.freddo_operator(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function freddo_private.operator_authorized(uuid,uuid),public.freddo_operator_authorized(uuid,uuid),freddo_private.operator_action(uuid,text,jsonb),public.freddo_operator(uuid,text,jsonb) to service_role;

-- Preserve known incidents when a subsystem is unavailable; unknown is not recovery.
create function freddo_private.report_failure(p_date date,p_condition jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare conditions jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('health:'||p_date::text,0));
 select coalesce(jsonb_agg(jsonb_build_object('category',category,'source_id',source_id,'summary',summary)),'[]') into conditions from freddo_private.alert_incidents where uk_date=p_date and active and category<>p_condition->>'category';
 return freddo_private.reconcile_alerts(p_date,conditions||jsonb_build_array(p_condition));
end $$;
revoke all on function freddo_private.report_failure(date,jsonb) from public,anon,authenticated;
grant execute on function freddo_private.report_failure(date,jsonb) to service_role;

create function public.freddo_report_failure(p_date date,p_condition jsonb) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.report_failure(p_date,p_condition)$$;
revoke all on function public.freddo_report_failure(date,jsonb),freddo_private.report_failure(date,jsonb) from public,anon,authenticated;
grant execute on function public.freddo_report_failure(date,jsonb),freddo_private.report_failure(date,jsonb) to service_role;
