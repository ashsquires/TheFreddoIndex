create schema if not exists freddo_private;
revoke all on schema freddo_private from public, anon, authenticated;

create table freddo_private.retailers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create table freddo_private.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  name text not null,
  variant text not null,
  created_at timestamptz not null default now()
);
create table freddo_private.retailer_sources (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references freddo_private.retailers,
  product_id uuid not null references freddo_private.products,
  product_url text not null check (length(product_url) <= 2048),
  retailer_product_key text not null,
  scope text not null,
  expected_pack_count integer not null check (expected_pack_count between 1 and 1000),
  expected_weight_g numeric not null check (expected_weight_g > 0 and expected_weight_g <= 10000),
  valid_from timestamptz not null default now(),
  valid_to timestamptz check (valid_to > valid_from),
  collection_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_current_source on freddo_private.retailer_sources(retailer_id, product_id, scope) where valid_to is null;

create table freddo_private.policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  created_at timestamptz not null default now(),
  effective_from timestamptz not null,
  freshness_hours integer not null check (freshness_hours > 0),
  out_of_stock_flag_days integer not null check (out_of_stock_flag_days > 0),
  admission_days integer not null check (admission_days > 0),
  observation_image_retention_days integer not null check (observation_image_retention_days > 0),
  diagnostic_image_retention_days integer not null check (diagnostic_image_retention_days > 0),
  price_change_threshold_pct numeric not null check (price_change_threshold_pct > 0),
  collection_time time not null,
  calculation_time time not null,
  timezone text not null check (timezone = 'Europe/London'),
  max_image_bytes integer not null check (max_image_bytes between 1 and 5242880),
  methodology_version text not null
);

insert into freddo_private.retailers(slug,name) values ('asda','ASDA'),('tesco','Tesco'),('sainsburys','Sainsbury''s');
insert into freddo_private.products(slug,brand,name,variant) values ('freddo-original','Cadbury','Dairy Milk Freddo','milk-chocolate');
insert into freddo_private.policy_versions(version,effective_from,freshness_hours,out_of_stock_flag_days,admission_days,observation_image_retention_days,diagnostic_image_retention_days,price_change_threshold_pct,collection_time,calculation_time,timezone,max_image_bytes,methodology_version)
values (1,'2026-10-16T00:00:00Z',168,14,7,365,30,25,'08:00','10:00','Europe/London',5242880,'public-price-v1');
insert into freddo_private.retailer_sources(retailer_id,product_id,product_url,retailer_product_key,scope,expected_pack_count,expected_weight_g)
select r.id,p.id,s.url,s.product_key,'signed-out-no-postcode',1,18
from (values
 ('asda','https://www.asda.com/groceries/product/5803656','5803656'),
 ('tesco','https://www.tesco.com/shop/en-GB/products/275341411','275341411'),
 ('sainsburys','https://www.sainsburys.co.uk/groceries/product/cadbury-dairy-milk-freddo-chocolate-bar-18g','cadbury-dairy-milk-freddo-chocolate-bar-18g')
) s(slug,url,product_key)
join freddo_private.retailers r on r.slug=s.slug cross join freddo_private.products p where p.slug='freddo-original';

alter table freddo_private.retailers enable row level security;
alter table freddo_private.products enable row level security;
alter table freddo_private.retailer_sources enable row level security;
alter table freddo_private.policy_versions enable row level security;
revoke all on all tables in schema freddo_private from public, anon, authenticated;

create table freddo_private.collection_runs (
 id uuid primary key default gen_random_uuid(),
 principal_id uuid not null,
 idempotency_key text not null unique,
 scheduled_for timestamptz not null,
 uk_run_date date generated always as ((scheduled_for at time zone 'Europe/London')::date) stored,
 trigger text not null check (trigger in ('scheduled','manual','synthetic')),
 collector_version text not null check (length(collector_version) between 1 and 100),
 policy_version_id uuid not null references freddo_private.policy_versions,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check (status in ('running','complete','partial','failed')),
 chatgpt_run_url text,
 created_at timestamptz not null default now()
);
create unique index one_scheduled_slot on freddo_private.collection_runs(scheduled_for) where trigger='scheduled';
create table freddo_private.collection_run_sources (
 run_id uuid not null references freddo_private.collection_runs,
 source_id uuid not null references freddo_private.retailer_sources,
 required boolean not null default true,
 primary key(run_id,source_id)
);
create table freddo_private.collection_attempts (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null,
 source_id uuid not null,
 attempt_number integer not null check(attempt_number between 1 and 2),
 started_at timestamptz not null,
 finished_at timestamptz not null check(finished_at >= started_at),
 outcome text not null check(outcome in ('price_observed','no_price','blocked','login_required','wrong_product','timeout','error')),
 http_status integer check(http_status between 100 and 599),
 error_code text,
 error_message text check(length(error_message)<=2000),
 final_url text not null check(length(final_url)<=2048),
 availability text not null check(availability in ('available','out_of_stock','unknown')),
 availability_observed_at timestamptz,
 evidence_excerpt text check(length(evidence_excerpt)<=8000),
 created_at timestamptz not null default now(),
 foreign key(run_id,source_id) references freddo_private.collection_run_sources,
 unique(run_id,source_id,attempt_number),
 check(outcome not in ('blocked','login_required','timeout','error') or availability='unknown'),
 check(availability='unknown' or availability_observed_at is not null),
 check(availability_observed_at is null or availability_observed_at between started_at and finished_at)
);
create index attempts_source_time on freddo_private.collection_attempts(source_id,started_at);
create table freddo_private.price_observations (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references freddo_private.collection_attempts,
 revision_number integer not null default 1 check(revision_number>0),
 supersedes_observation_id uuid unique,
 correction_reason text,
 observed_at timestamptz not null,
 uk_observation_date date generated always as ((observed_at at time zone 'Europe/London')::date) stored,
 product_title text not null check(length(product_title) between 1 and 500),
 source_url text not null check(length(source_url)<=2048),
 pack_count integer not null check(pack_count between 1 and 1000),
 weight_g numeric not null check(weight_g>0 and weight_g<=10000),
 currency text not null default 'GBP' check(currency='GBP'),
 normal_price_pence integer check(normal_price_pence between 1 and 100000),
 public_offer_price_pence integer check(public_offer_price_pence between 1 and 100000),
 loyalty_price_pence integer check(loyalty_price_pence between 1 and 100000),
 loyalty_offer_conditions text check(length(loyalty_offer_conditions)<=2000),
 loyalty_offer_expires_at timestamptz,
 loyalty_offer_expiry_text text check(length(loyalty_offer_expiry_text)<=2000),
 offer_conditions text check(length(offer_conditions)<=2000),
 offer_expires_at timestamptz,
 offer_expiry_text text check(length(offer_expiry_text)<=2000),
 price_evidence_text text not null check(length(price_evidence_text) between 1 and 8000),
 availability text not null check(availability in ('available','out_of_stock','unknown')),
 created_at timestamptz not null default now(),
 unique(attempt_id,revision_number),
 unique(id,attempt_id),
 foreign key(supersedes_observation_id,attempt_id) references freddo_private.price_observations(id,attempt_id),
 check(coalesce(normal_price_pence,public_offer_price_pence,loyalty_price_pence) is not null),
 check((revision_number=1 and supersedes_observation_id is null and correction_reason is null) or
       (revision_number>1 and supersedes_observation_id is not null and correction_reason is not null and length(trim(correction_reason))>0))
);
create index observations_time on freddo_private.price_observations(observed_at);
create table freddo_private.observation_reviews (
 id uuid primary key default gen_random_uuid(),
 observation_id uuid not null references freddo_private.price_observations,
 sequence_number integer not null check(sequence_number>0),
 decision text not null check(decision in ('pending','accepted','quarantined','rejected','superseded')),
 reason_codes text[] not null default '{}',
 note text,
 actor text not null,
 policy_version_id uuid not null references freddo_private.policy_versions,
 baseline_normal_id uuid references freddo_private.price_observations,
 baseline_effective_id uuid references freddo_private.price_observations,
 created_at timestamptz not null default now(),
 unique(observation_id,sequence_number)
);
create table freddo_private.screenshot_evidence (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references freddo_private.collection_attempts,
 observation_id uuid,
 purpose text not null check(purpose in ('observation','diagnostic')),
 captured_at timestamptz,
 upload_key uuid not null unique default gen_random_uuid(),
 bucket_name text not null default 'freddo-evidence' check(bucket_name='freddo-evidence'),
 object_path text unique,
 mime_type text check(mime_type in ('image/png','image/jpeg','image/webp')),
 byte_size integer check(byte_size between 1 and 5242880),
 sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'reserved' check(state in ('reserved','uploading','stored','failed','expired')),
 failure_code text check(failure_code in ('capture_failed','upload_failed')),
 uploaded_at timestamptz,
 expires_at timestamptz,
 deleted_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 foreign key(observation_id,attempt_id) references freddo_private.price_observations(id,attempt_id),
 check(purpose <> 'observation' or observation_id is not null),
 check(state <> 'stored' or (captured_at is not null and mime_type is not null and byte_size is not null and sha256 is not null and object_path is not null and uploaded_at is not null and expires_at is not null and failure_code is null)),
 check(state <> 'failed' or failure_code is not null),
 check(state <> 'expired' or deleted_at is not null)
);
create index evidence_expiry on freddo_private.screenshot_evidence(state,expires_at);
create index evidence_observation on freddo_private.screenshot_evidence(observation_id);

create function freddo_private.reject_fact_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable fact: append a revision'; end $$;
create function freddo_private.validate_observation() returns trigger language plpgsql set search_path='' as $$
declare a freddo_private.collection_attempts; previous freddo_private.price_observations;
begin
 select * into strict a from freddo_private.collection_attempts where id=new.attempt_id;
 if a.outcome <> 'price_observed' or new.observed_at < a.started_at or new.observed_at > a.finished_at then
   raise exception 'observation must belong to a successful attempt and its time window';
 end if;
 if new.revision_number>1 then
   select * into strict previous from freddo_private.price_observations where id=new.supersedes_observation_id;
   if previous.attempt_id<>new.attempt_id or previous.observed_at<>new.observed_at or previous.revision_number+1<>new.revision_number then
     raise exception 'correction must preserve attempt and time and follow its predecessor';
   end if;
 end if;
 return new;
end $$;
create trigger validate_observation before insert on freddo_private.price_observations for each row execute function freddo_private.validate_observation();

-- The migration is applied once by migration version. No default API privileges.
do $$ declare t text; begin
 foreach t in array array['collection_runs','collection_run_sources','collection_attempts','price_observations','observation_reviews','screenshot_evidence'] loop
  execute format('alter table freddo_private.%I enable row level security',t);
  execute format('revoke all on freddo_private.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['products','policy_versions','collection_run_sources','collection_attempts','price_observations','observation_reviews'] loop
  execute format('create trigger immutable_fact before update or delete on freddo_private.%I for each row execute function freddo_private.reject_fact_mutation()',t);
 end loop;
end $$;
revoke all on all functions in schema freddo_private from public,anon,authenticated;

create function freddo_private.validate_review_sequence() returns trigger language plpgsql set search_path='' as $$
declare latest integer;
begin
 perform 1 from freddo_private.price_observations where id=new.observation_id for update;
 select coalesce(max(sequence_number),0) into latest from freddo_private.observation_reviews where observation_id=new.observation_id;
 if new.sequence_number<>latest+1 then raise exception 'review sequence conflict'; end if;
 return new;
end $$;
create trigger ordered_reviews before insert on freddo_private.observation_reviews for each row execute function freddo_private.validate_review_sequence();
create view freddo_private.eligible_observations with (security_invoker=true) as
select o.*, a.source_id, s.retailer_id, s.product_id, s.scope, r.id as run_id, v.id as review_id
from freddo_private.price_observations o
join freddo_private.collection_attempts a on a.id=o.attempt_id
join freddo_private.collection_runs r on r.id=a.run_id
join freddo_private.retailer_sources s on s.id=a.source_id
join lateral (select id,decision from freddo_private.observation_reviews where observation_id=o.id order by sequence_number desc limit 1) v on true
where r.trigger<>'synthetic' and v.decision='accepted'
 and o.pack_count=s.expected_pack_count and o.pack_count=1 and o.weight_g=s.expected_weight_g
 and not exists(select 1 from freddo_private.price_observations successor where successor.supersedes_observation_id=o.id);
revoke all on freddo_private.eligible_observations from public,anon,authenticated;
revoke all on all functions in schema freddo_private from public,anon,authenticated;

create function freddo_private.protect_source_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'source identity is immutable'; end if;
 if (to_jsonb(new)-'valid_to'-'collection_enabled') is distinct from (to_jsonb(old)-'valid_to'-'collection_enabled')
 or (old.valid_to is not null and new.valid_to is distinct from old.valid_to) then
  raise exception 'source identity is immutable; create a version';
 end if;
 return new;
end $$;
create trigger protect_source before update or delete on freddo_private.retailer_sources for each row execute function freddo_private.protect_source_identity();
create function freddo_private.protect_run_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'run identity is immutable'; end if;
 if (to_jsonb(new)-'status'-'finished_at'-'uk_run_date') is distinct from (to_jsonb(old)-'status'-'finished_at'-'uk_run_date') then
  raise exception 'run identity is immutable';
 end if;
 return new;
end $$;
create trigger protect_run before update or delete on freddo_private.collection_runs for each row execute function freddo_private.protect_run_identity();
revoke all on all functions in schema freddo_private from public,anon,authenticated;

create trigger keep_evidence_history before delete on freddo_private.screenshot_evidence for each row execute function freddo_private.reject_fact_mutation();
create function freddo_private.validate_evidence() returns trigger language plpgsql set search_path='' as $$
declare outcome text;
begin
 if tg_op='UPDATE' and row(new.id,new.attempt_id,new.observation_id,new.purpose,new.upload_key,new.bucket_name) is distinct from row(old.id,old.attempt_id,old.observation_id,old.purpose,old.upload_key,old.bucket_name) then
  raise exception 'evidence linkage is immutable';
 end if;
 select a.outcome into strict outcome from freddo_private.collection_attempts a where a.id=new.attempt_id;
 if new.purpose='diagnostic' and (new.observation_id is not null or outcome='price_observed') then
  raise exception 'diagnostic evidence requires a failed attempt and no observation';
 end if;
 return new;
end $$;
create trigger validate_evidence before insert or update on freddo_private.screenshot_evidence for each row execute function freddo_private.validate_evidence();
revoke all on all functions in schema freddo_private from public,anon,authenticated;
