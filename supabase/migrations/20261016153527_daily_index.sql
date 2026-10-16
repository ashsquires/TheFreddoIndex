create table freddo_private.index_memberships(
 id uuid primary key default gen_random_uuid(),retailer_id uuid not null references freddo_private.retailers,
 product_id uuid not null references freddo_private.products,source_id uuid not null references freddo_private.retailer_sources,effective_from_date date not null,effective_to_date date,
 weight numeric not null check(weight>0 and weight<=1000000),admitted_at timestamptz not null default now(),decision_actor uuid not null,decision_reason text not null check(length(trim(decision_reason))>0),
 ended_by uuid,end_reason text,check(effective_to_date is null or effective_to_date>effective_from_date)
);
create function freddo_private.validate_membership() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from freddo_private.retailers where id=new.retailer_id for update;
 if not exists(select 1 from freddo_private.retailer_sources where id=new.source_id and retailer_id=new.retailer_id and product_id=new.product_id) then raise exception 'VALIDATION_FAILED';end if;
 if tg_op='UPDATE' and ((to_jsonb(new)-array['effective_to_date','ended_by','end_reason'])<>(to_jsonb(old)-array['effective_to_date','ended_by','end_reason']) or old.effective_to_date is not null or new.effective_to_date is null or new.ended_by is null or length(trim(coalesce(new.end_reason,'')))=0) then raise exception 'immutable membership: close once, then append';end if;
 if exists(select 1 from freddo_private.index_memberships m where m.id<>new.id and m.retailer_id=new.retailer_id and m.product_id=new.product_id and daterange(m.effective_from_date,m.effective_to_date,'[)') && daterange(new.effective_from_date,new.effective_to_date,'[)')) then raise exception 'CONFLICT';end if;
 return new;
end $$;
create trigger membership_intervals before insert or update on freddo_private.index_memberships for each row execute function freddo_private.validate_membership();
create trigger immutable_membership before delete on freddo_private.index_memberships for each row execute function freddo_private.reject_fact_mutation();
create table freddo_private.index_daily_values(
 id uuid primary key default gen_random_uuid(),uk_date date not null,revision_number integer not null check(revision_number>0),as_of_at timestamptz not null,
 policy_version_id uuid not null references freddo_private.policy_versions,methodology_version text not null,
 status text not null check(status in ('published','paused')),average_price_pence numeric,average_price_per_100g_pence numeric,
 expected_member_count integer not null,usable_member_count integer not null,computed_at timestamptz not null default now(),
 supersedes_value_id uuid references freddo_private.index_daily_values,revision_reason text not null check(length(trim(revision_reason))>0),input_signature text not null,
 unique(uk_date,revision_number),check((status='published' and average_price_pence is not null and average_price_per_100g_pence is not null and expected_member_count=usable_member_count and expected_member_count>0) or (status='paused' and average_price_pence is null and average_price_per_100g_pence is null))
);
create table freddo_private.index_inputs(
 id uuid primary key default gen_random_uuid(),daily_value_id uuid not null references freddo_private.index_daily_values,membership_id uuid not null references freddo_private.index_memberships,
 retailer_id uuid not null references freddo_private.retailers,observation_id uuid references freddo_private.price_observations,review_id uuid references freddo_private.observation_reviews,
 selected_price_kind text check(selected_price_kind in ('normal','public_offer')),selected_price_pence integer check(selected_price_pence>0),
 weight_used numeric not null check(weight_used>0),weight_g_used numeric check(weight_g_used>0),carried_forward boolean not null,observation_age_seconds numeric,
 exclusion_reason text,membership_snapshot jsonb not null,unique(daily_value_id,retailer_id),
 check((exclusion_reason is null and observation_id is not null and review_id is not null and selected_price_kind is not null and selected_price_pence is not null and weight_g_used is not null) or (exclusion_reason is not null and selected_price_pence is null))
);
create index index_input_observation on freddo_private.index_inputs(observation_id);
do $$declare t text;begin
 foreach t in array array['index_memberships','index_daily_values','index_inputs'] loop
 execute format('alter table freddo_private.%I enable row level security',t);execute format('revoke all on freddo_private.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['index_daily_values','index_inputs'] loop execute format('create trigger immutable_fact before update or delete on freddo_private.%I for each row execute function freddo_private.reject_fact_mutation()',t);end loop;
end $$;
create function freddo_private.offer_expiry(p_timestamp timestamptz,p_text text) returns timestamptz language plpgsql immutable set search_path='' as $$
begin
 if p_timestamp is not null then return p_timestamp;end if;
 if p_text ~ '^\d{4}-\d{2}-\d{2}$' then
  begin return (p_text::date+1)::timestamp at time zone 'Europe/London';exception when others then return null;end;
 end if;return null;
end $$;
create function freddo_private.calculate_index(p_date date,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy freddo_private.policy_versions;cutoff timestamptz;m freddo_private.index_memberships;o record;prior freddo_private.index_daily_values;
 inputs jsonb:='[]';item jsonb;signature text;result freddo_private.index_daily_values;price integer;kind text;excluded text;age numeric;expected integer:=0;usable integer:=0;total numeric:=0;per100 numeric:=0;weights numeric:=0;
begin
 if length(trim(coalesce(p_reason,'')))=0 then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('index:'||p_date::text,0));
 select * into strict policy from freddo_private.policy_versions where effective_from<=(p_date+time '10:00') at time zone 'Europe/London' order by effective_from desc,version desc limit 1;
 cutoff:=(p_date+policy.calculation_time) at time zone policy.timezone;
 if cutoff>now() then raise exception 'CUTOFF_REACHED';end if;
 for m in select * from freddo_private.index_memberships where effective_from_date<=p_date and (effective_to_date is null or effective_to_date>p_date) order by retailer_id loop
  expected:=expected+1;price:=null;kind:=null;excluded:=null;age:=null;
  select * into o from freddo_private.eligible_observations where source_id=m.source_id and retailer_id=m.retailer_id and product_id=m.product_id and (normal_price_pence is not null or public_offer_price_pence is not null) and observed_at<=cutoff order by observed_at desc,created_at desc,id desc limit 1;
  if not found then excluded:='missing_price';
  else
   if o.public_offer_price_pence is not null and (freddo_private.offer_expiry(o.offer_expires_at,o.offer_expiry_text) is null or freddo_private.offer_expiry(o.offer_expires_at,o.offer_expiry_text)>cutoff) then price:=o.public_offer_price_pence;kind:='public_offer';
   elsif o.normal_price_pence is not null then price:=o.normal_price_pence;kind:='normal';
   elsif o.public_offer_price_pence is not null and freddo_private.offer_expiry(o.offer_expires_at,o.offer_expiry_text)<=cutoff then
    select * into o from freddo_private.eligible_observations where source_id=m.source_id and retailer_id=m.retailer_id and product_id=m.product_id and (normal_price_pence is not null or public_offer_price_pence is not null) and observed_at<=cutoff and normal_price_pence is not null order by observed_at desc,created_at desc,id desc limit 1;
    if found then price:=o.normal_price_pence;kind:='normal';else excluded:='expired_offer_no_normal';end if;
   else excluded:='no_public_price';end if;
   if o.id is not null then age:=extract(epoch from cutoff-o.observed_at);end if;
   if age>policy.freshness_hours*3600 then excluded:='stale_price';price:=null;end if;
  end if;
  item:=jsonb_build_object('membership_id',m.id,'retailer_id',m.retailer_id,'observation_id',o.id,'review_id',o.review_id,'selected_price_kind',kind,'selected_price_pence',price,'weight_used',m.weight,'weight_g_used',o.weight_g,'carried_forward',coalesce(o.uk_observation_date<p_date,false),'observation_age_seconds',age,'exclusion_reason',excluded,'membership_snapshot',jsonb_build_object('id',m.id,'retailer_id',m.retailer_id,'product_id',m.product_id,'source_id',m.source_id,'weight',m.weight,'effective_from_date',m.effective_from_date));
  inputs:=inputs||jsonb_build_array(item);
  if excluded is null then usable:=usable+1;total:=total+price*m.weight;per100:=per100+(price*100::numeric/o.weight_g)*m.weight;weights:=weights+m.weight;end if;
 end loop;
 signature:=md5(jsonb_build_object('inputs',inputs,'policy',policy.id,'cutoff',cutoff)::text);
 select * into prior from freddo_private.index_daily_values where uk_date=p_date order by revision_number desc limit 1;
 if prior.id is not null and prior.input_signature=signature then return to_jsonb(prior)||jsonb_build_object('replayed',true);end if;
 insert into freddo_private.index_daily_values(uk_date,revision_number,as_of_at,policy_version_id,methodology_version,status,average_price_pence,average_price_per_100g_pence,expected_member_count,usable_member_count,supersedes_value_id,revision_reason,input_signature)
 values(p_date,coalesce(prior.revision_number,0)+1,cutoff,policy.id,policy.methodology_version,case when expected>0 and usable=expected then 'published' else 'paused' end,case when expected>0 and usable=expected then total/weights end,case when expected>0 and usable=expected then per100/weights end,expected,usable,prior.id,p_reason,signature) returning * into result;
 for item in select value from jsonb_array_elements(inputs) loop
  insert into freddo_private.index_inputs(daily_value_id,membership_id,retailer_id,observation_id,review_id,selected_price_kind,selected_price_pence,weight_used,weight_g_used,carried_forward,observation_age_seconds,exclusion_reason,membership_snapshot)
  values(result.id,(item->>'membership_id')::uuid,(item->>'retailer_id')::uuid,(item->>'observation_id')::uuid,(item->>'review_id')::uuid,item->>'selected_price_kind',(item->>'selected_price_pence')::int,(item->>'weight_used')::numeric,(item->>'weight_g_used')::numeric,(item->>'carried_forward')::boolean,(item->>'observation_age_seconds')::numeric,item->>'exclusion_reason',item->'membership_snapshot');
 end loop;
 return to_jsonb(result)||jsonb_build_object('replayed',false);
end $$;
create function freddo_private.membership_action(p_user uuid,p_action text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m freddo_private.index_memberships;policy freddo_private.policy_versions;day date;start_date date;receipt jsonb;source freddo_private.retailer_sources;
begin
 if not exists(select 1 from freddo_private.operator_access where user_id=p_user and enabled and expires_at>now()) then raise exception 'FORBIDDEN';end if;
 if length(trim(coalesce(args->>'reason','')))=0 or coalesce(args->>'request_key','') !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':membership:'||(args->>'request_key'),0));
 receipt:=freddo_private.lookup_ingestion_receipt(p_user,'membership_'||p_action,args);if receipt is not null then return receipt;end if;
 start_date:=(args->>'effective_date')::date;
 if p_action in ('admit','remove') and (start_date is null or start_date<(now() at time zone 'Europe/London')::date) then raise exception 'VALIDATION_FAILED';end if;
 if p_action='admit' then
  select * into strict source from freddo_private.retailer_sources where id=(args->>'source_id')::uuid and collection_enabled and valid_to is null;
  select * into strict policy from freddo_private.policy_versions where effective_from<=now() order by effective_from desc,version desc limit 1;
  -- Seven immediately preceding UK dates, each with actual public price evidence. Images are not an admission gate.
  for day in select (start_date-n)::date from generate_series(1,policy.admission_days) n loop
   if not exists(select 1 from freddo_private.eligible_observations o where o.source_id=source.id and o.uk_observation_date=day and (o.normal_price_pence is not null or (o.public_offer_price_pence is not null and (freddo_private.offer_expiry(o.offer_expires_at,o.offer_expiry_text) is null or freddo_private.offer_expiry(o.offer_expires_at,o.offer_expiry_text)>o.observed_at)))) then raise exception 'ADMISSION_NOT_READY';end if;
  end loop;
  insert into freddo_private.index_memberships(retailer_id,product_id,source_id,effective_from_date,weight,decision_actor,decision_reason) values(source.retailer_id,source.product_id,source.id,start_date,(args->>'weight')::numeric,p_user,args->>'reason') returning * into m;
  receipt:=to_jsonb(m);
 elsif p_action='remove' then
  update freddo_private.index_memberships set effective_to_date=start_date,ended_by=p_user,end_reason=args->>'reason' where id=(args->>'membership_id')::uuid and effective_to_date is null returning * into m;
  if not found then raise exception 'CONFLICT';end if;receipt:=to_jsonb(m);
 elsif p_action='recompute' then receipt:=freddo_private.calculate_index((args->>'uk_date')::date,'Operator: '||(args->>'reason'));
 else raise exception 'VALIDATION_FAILED';end if;
 insert into freddo_private.ingestion_receipts values(p_user,'membership_'||p_action,args->>'request_key',args,receipt,now());return receipt;
end $$;
create function public.freddo_calculate_index(p_date date,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.calculate_index(p_date,p_reason)$$;
create function public.freddo_membership(p_user uuid,p_action text,p_args jsonb) returns jsonb language sql security invoker set search_path='' as $$select freddo_private.membership_action(p_user,p_action,p_args)$$;
create function freddo_private.index_report() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('memberships',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from freddo_private.index_memberships m),'values',(select coalesce(jsonb_agg(to_jsonb(v) order by uk_date desc,revision_number desc),'[]') from (select * from freddo_private.index_daily_values order by uk_date desc,revision_number desc limit 60) v),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from freddo_private.index_inputs i where daily_value_id in(select id from freddo_private.index_daily_values order by uk_date desc,revision_number desc limit 60)))
$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='freddo_private' and p.proname in ('offer_expiry','calculate_index','membership_action','validate_membership')) or (n.nspname='public' and p.proname in ('freddo_calculate_index','freddo_membership','freddo_index_report')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create function freddo_private.validate_index_input() returns trigger language plpgsql set search_path='' as $$
declare m freddo_private.index_memberships;
begin
 select * into strict m from freddo_private.index_memberships where id=new.membership_id;
 if new.retailer_id<>m.retailer_id or new.weight_used<>m.weight then raise exception 'VALIDATION_FAILED';end if;
 if new.observation_id is not null and not exists(select 1 from freddo_private.price_observations o join freddo_private.collection_attempts a on a.id=o.attempt_id where o.id=new.observation_id and a.source_id=m.source_id) then raise exception 'VALIDATION_FAILED';end if;
 if new.review_id is not null and not exists(select 1 from freddo_private.observation_reviews where id=new.review_id and observation_id=new.observation_id) then raise exception 'VALIDATION_FAILED';end if;
 return new;
end $$;
create trigger validate_index_input before insert on freddo_private.index_inputs for each row execute function freddo_private.validate_index_input();
revoke all on function freddo_private.validate_index_input() from public,anon,authenticated;

create function public.freddo_index_report() returns jsonb language sql security invoker set search_path='' as $$select freddo_private.index_report()$$;
revoke all on function public.freddo_index_report(),freddo_private.index_report() from public,anon,authenticated;
grant execute on function public.freddo_index_report(),freddo_private.index_report() to service_role;
