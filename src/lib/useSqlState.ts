import {useCallback, useEffect, useState} from 'react';
import {fetchSqlState, markExported, markMigration, type SqlState} from './supabaseCuration';

const LOCAL_KEY = 'apexqcuradoria:sql-state:v2';
const readLocal = (): SqlState => {
  try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'); if (v && Array.isArray(v.exported)) return v; } catch { /* empty */ }
  return {exported: [], migrations: {}};
};
const writeLocal = (s: SqlState) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } };

/**
 * What already went to the main database. Shared through Supabase when
 * migration 20261029150000 is applied; otherwise kept in this browser only.
 */
export function useSqlState(curatorName: string) {
  const [state, setState] = useState<SqlState>({exported: [], migrations: {}});
  const [shared, setShared] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback((signal?: AbortSignal) => fetchSqlState(signal)
    .then(s => { if (s) { setState(s); setShared(true); } else { setState(readLocal()); setShared(false); } })
    .catch(e => { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setState(readLocal()); setShared(false); } }), []);
  useEffect(() => { const c = new AbortController(); void reload(c.signal); return () => c.abort(); }, [reload]);

  const setExported = useCallback(async (items: {id: string; version: number}[], batch: string | null, done: boolean) => {
    if (shared) { await markExported(items, batch, done); await reload(); return; }
    setState(prev => {
      const keys = new Set(items.map(i => `${i.id}|${i.version}`));
      const kept = prev.exported.filter(e => !keys.has(`${e.id}|${e.version}`));
      const next = {...prev, exported: done ? [...kept, ...items.map(i => ({...i, batch, by: curatorName, at: new Date().toISOString()}))] : kept};
      writeLocal(next);
      return next;
    });
  }, [shared, reload, curatorName]);

  const setMigration = useCallback(async (file: string, done: boolean) => {
    if (shared) { const migrations = await markMigration(file, done); setState(prev => ({...prev, migrations})); return; }
    setState(prev => {
      const migrations = {...prev.migrations};
      if (done) migrations[file] = {by: curatorName, at: new Date().toISOString()}; else delete migrations[file];
      const next = {...prev, migrations};
      writeLocal(next);
      return next;
    });
  }, [shared, curatorName]);

  return {state, shared, error, setExported, setMigration};
}
