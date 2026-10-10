import type {Question} from '../types/question';
export type SharedRow = {id:string; patch:Partial<Question>; version:number};

// Preserve references on idle polls so filtering, sorting and SQL generation
// do not run again over the full dataset when nothing changed.
export function mergeShared(local:Question[], rows:SharedRow[]):Question[] {
  if (!rows.length) return local;
  const byId=new Map(rows.map(row=>[row.id,row]));
  let changed=false;
  const merged=local.map(q=>{
    const row=byId.get(q.id);
    if (!row || row.version <= (q.sync_version ?? -1)) return q;
    changed=true;
    return {...q,...row.patch,sync_version:row.version};
  });
  return changed ? merged : local;
}
