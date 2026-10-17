-- Read-only history through the existing owner-authenticated operator boundary.
create function freddo_private.operator_history(p_user uuid,p_observation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target_attempt uuid; result jsonb;
begin
 if not exists(select 1 from freddo_private.operator_access where user_id=p_user and enabled and expires_at>now()) then raise exception 'FORBIDDEN'; end if;
 select attempt_id into target_attempt from freddo_private.price_observations where id=p_observation;
 if target_attempt is null then raise exception 'NOT_FOUND'; end if;
 select jsonb_build_object('revisions',jsonb_agg(to_jsonb(o)||jsonb_build_object('reviews',
  (select coalesce(jsonb_agg(to_jsonb(r) order by sequence_number),'[]') from freddo_private.observation_reviews r where r.observation_id=o.id)) order by o.revision_number))
 into result from freddo_private.price_observations o where o.attempt_id=target_attempt;
 return result;
end $$;
create or replace function public.freddo_operator(p_user uuid,p_action text,p_args jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_action='history' then return freddo_private.operator_history(p_user,(p_args->>'observation_id')::uuid); end if;
 return freddo_private.operator_action(p_user,p_action,p_args);
end $$;
revoke all on function freddo_private.operator_history(uuid,uuid),public.freddo_operator(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function freddo_private.operator_history(uuid,uuid),public.freddo_operator(uuid,text,jsonb) to service_role;
