begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function curation_private.request_apex_sync() returns boolean
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 perform pg_advisory_xact_lock(741903208);
 if exists(select 1 from curation_private.apex_sync_runs where (status in ('queued','running') and created_at>now()-interval '5 minutes') or (status='complete' and finished_at>now()-interval '50 seconds')) then return false; end if;
 token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into curation_private.apex_sync_runs(token_hash) values(encode(sha256(convert_to(token,'UTF8')),'hex'));
 perform net.http_post(
 url:='https://jcbinmjiimqomjdyfdia.supabase.co/functions/v1/sync-apex-questions',
 headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_2dVE51sq6_Sb7-Hj9R1MdA_1qclrXTY','x-apex-sync-token',token),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
 return true;
end $$;
revoke all on function curation_private.request_apex_sync() from public,anon,authenticated;
create function public.curation_apex_refresh() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
 return curation_private.request_apex_sync();
end $$;
revoke all on function public.curation_apex_refresh() from public;
grant execute on function public.curation_apex_refresh() to anon,authenticated;
select cron.schedule('apex-question-sync','* * * * *','select curation_private.request_apex_sync()');
commit;
