import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateProgressiveSqlBatches} from '../src/lib/sqlGenerator';
import type {Question} from '../src/types/question';

// A small copy of the Apex Medicina tables the quarantine touches, with the same
// definitions as production (question_lifecycle, its audit trigger, RLS, is_curator_user).
const SCHEMA = `
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create table public.questions(id bigint primary key, categoria text, tema_especifico text, ano text, origem text, enunciado text,
  especialidade text, competencias text);
create table public.profiles(id uuid primary key, is_admin boolean default false, is_curator boolean default false, is_master boolean default false);
create table public.user_history(id serial primary key, user_id uuid, question_id bigint references public.questions(id), is_correct boolean, created_at timestamptz default now());
create table public.question_lifecycle(question_id bigint primary key references public.questions(id), state text not null default 'active'
  check (state = any (array['draft','active','under_review','obsolete','archived'])), obsolescence_reason text, curator_id uuid,
  state_changed_at timestamptz not null default now(), effective_date date, citation_url text, citation_text text, replacement_question_id bigint,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.question_lifecycle_audit(id bigserial primary key, question_id bigint not null, previous_state text, new_state text not null,
  reason_code text, curator_id uuid, citation_url text, notes text, changed_at timestamptz not null default now());
create function public.log_lifecycle_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.question_lifecycle_audit(question_id, previous_state, new_state, reason_code, curator_id, citation_url, notes)
    values (new.question_id, null, new.state, new.obsolescence_reason, new.curator_id, new.citation_url, new.notes);
  elsif new.state is distinct from old.state then
    insert into public.question_lifecycle_audit(question_id, previous_state, new_state, reason_code, curator_id, citation_url, notes)
    values (new.question_id, old.state, new.state, new.obsolescence_reason, new.curator_id, new.citation_url, new.notes);
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger question_lifecycle_audit_trigger before insert or update on public.question_lifecycle for each row execute function public.log_lifecycle_change();
create function public.is_curator_user() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin or is_curator or is_master from public.profiles where id = auth.uid()), false) $$;
create function public.get_user_mistakes() returns setof public.questions language sql security definer set search_path to 'public' as $$
  select distinct on (q.id) q.* from questions q inner join user_history uh on q.id = uh.question_id
  where uh.user_id = auth.uid() and uh.is_correct = false order by q.id, uh.created_at desc $$;
create function public.get_question_facets(p_user_id uuid) returns jsonb language sql security definer set search_path to 'public' as $$
  select jsonb_build_object('categorias', (select jsonb_agg(jsonb_build_object('value', categoria, 'count', cnt))
    from (select categoria, count(*) as cnt from questions where categoria is not null group by categoria) t)) $$;
alter table public.questions enable row level security;
create policy "Permitir leitura de questoes" on public.questions for select to public using (true);
grant select on public.questions, public.question_lifecycle to authenticated;
grant execute on function public.get_user_mistakes(), public.get_question_facets(uuid), public.is_curator_user() to authenticated;
insert into public.questions(id, categoria, enunciado) select g, 'CM', 'Q' || g from generate_series(1, 5) g;
insert into public.profiles(id, is_curator) values ('00000000-0000-0000-0000-00000000000a', false), ('00000000-0000-0000-0000-00000000000c', true);
insert into public.user_history(user_id, question_id, is_correct) values
  ('00000000-0000-0000-0000-00000000000a', 2, false), ('00000000-0000-0000-0000-00000000000a', 4, false);
`;

const STUDENT = '00000000-0000-0000-0000-00000000000a', CURATOR = '00000000-0000-0000-0000-00000000000c';
const step2 = readFileSync(new URL('../supabase/apexmedicina/20261102_02_quarentena_nao_auditadas_APEXMEDICINA.sql', import.meta.url), 'utf8');
const step3 = readFileSync(new URL('../supabase/apexmedicina/20261102_03_liberar_quarentena_APEXMEDICINA.sql', import.meta.url), 'utf8');

test('the quarantine hides unaudited questions from students, curators still see them, and a migrated batch releases its questions', async () => {
  const {PGlite} = await import('@electric-sql/pglite');
  const db = new PGlite();
  const as = async (user: string, sql: string) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec('set role authenticated');
    const rows = (await db.query<Record<string, unknown>>(sql)).rows;
    await db.exec('reset role');
    return rows;
  };
  const visibleIds = async (user: string) => (await as(user, 'select id from public.questions order by id')).map(r => Number(r.id));
  try {
    await db.exec(SCHEMA);

    // Placeholder left in place, or an empty list: the script stops and changes nothing.
    // (The SQL Editor discards a failed run; here the same connection is reused, so roll it back.)
    const refuses = async (sql: string, message: RegExp) => { await assert.rejects(db.exec(sql), message); await db.exec('rollback'); };
    await refuses(step2, /malformed array literal/);
    await refuses(step2.replace('COLE_AQUI_A_LISTA', '{}'), /vazia/);
    await refuses(step2.replace('COLE_AQUI_A_LISTA', '{1,999}'), /não existem/);
    assert.equal((await db.query<{n: number}>('select count(*)::int as n from public.question_lifecycle')).rows[0].n, 0);

    // Questions 1 and 2 were audited (lots 1–12); 3, 4 and 5 go into quarantine.
    await db.exec(step2.replace('COLE_AQUI_A_LISTA', '{1,2}'));
    assert.deepEqual(await visibleIds(STUDENT), [1, 2]);
    assert.deepEqual(await visibleIds(CURATOR), [1, 2, 3, 4, 5]);
    // Functions that bypass RLS skip the quarantine too.
    assert.deepEqual((await as(STUDENT, 'select id from public.get_user_mistakes()')).map(r => Number(r.id)), [2]);
    assert.deepEqual(((await as(STUDENT, `select public.get_question_facets('${STUDENT}') as f`))[0].f as {categorias: unknown}).categorias, [{value: 'CM', count: 2}]);
    // Every change is in the audit trail.
    assert.equal((await db.query<{n: number}>("select count(*)::int as n from public.question_lifecycle_audit where new_state = 'under_review'")).rows[0].n, 3);

    // Running it again with the same list changes nothing more; questions in another state are left alone.
    await db.exec("update public.question_lifecycle set state = 'archived' where question_id = 5");
    await db.exec(step2.replace('COLE_AQUI_A_LISTA', '{1,2}'));
    assert.equal((await db.query<{state: string}>('select state from public.question_lifecycle where question_id = 5')).rows[0].state, 'archived');
    await db.exec("update public.question_lifecycle set state = 'under_review' where question_id = 5");

    // Lot 13 migrates question 3: the batch the site generates releases it.
    const {batches} = generateProgressiveSqlBatches([{id: '3', status: 'questao_corrigida', enunciado: 'Q3 corrigida'} as Question]);
    await db.exec(batches[0].sql);
    assert.deepEqual(await visibleIds(STUDENT), [1, 2, 3]);
    assert.equal((await db.query<{state: string}>('select state from public.question_lifecycle where question_id = 3')).rows[0].state, 'active');

    // Undo: option C of the release file, uncommented.
    const undo = step3.slice(step3.indexOf('-- begin;')).replace(/^-- /gm, '');
    await db.exec(undo);
    assert.deepEqual(await visibleIds(STUDENT), [1, 2, 3, 4, 5]);
  } finally {await db.close();}
});
