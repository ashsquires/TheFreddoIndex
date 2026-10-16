-- Personal Freddo project only. Execute after explicit activation approval, function
-- deployment and storing FREDDO_MAINTENANCE_KEY as Vault secret freddo_maintenance_key.
-- Never paste a key into this versioned file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='freddo_maintenance_key' and length(decrypted_secret)>=40) then raise exception 'Maintenance credential is not configured';end if;
end $$;
select cron.schedule('freddo-maintenance','*/5 * * * *',$job$
 select net.http_post(
  url:='https://ectikpmaidqobqfsqife.supabase.co/functions/v1/freddo-maintenance',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='freddo_maintenance_key')),
  body:='{}'::jsonb,
  timeout_milliseconds:=120000
 );
$job$);
-- Named scheduling updates the same job instead of creating duplicate wakeups.
