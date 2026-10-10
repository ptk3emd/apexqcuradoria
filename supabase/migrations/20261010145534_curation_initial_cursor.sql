begin;
-- Start before loading pages, then replay only concurrent changes after that point.
create function public.curation_initial_cursor() returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
 return (select coalesce(max(id),0) from curation_private.events);
end $$;
revoke all on function public.curation_initial_cursor() from public,anon;
grant execute on function public.curation_initial_cursor() to authenticated;
commit;
