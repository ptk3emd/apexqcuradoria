-- The app calls with the anon key and proves membership through the
-- x-apex-session header (curation_is_member), like curation_base.
grant execute on function public.curation_list_plan(integer),public.curation_list(bigint,bigint),public.curation_full(bigint[]),public.curation_search(text[]) to anon;
