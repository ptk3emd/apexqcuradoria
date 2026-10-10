import type {Question} from '../types/question';
export type SharedRow = {id:string; patch:Partial<Question>; version:number; deleted?:boolean};

// Preserve references on idle polls so filtering, sorting and SQL generation
// do not run again over the full dataset when nothing changed.
export function mergeShared(local:Question[], rows:SharedRow[]):Question[] {
  if (!rows.length) return local;
  const byId=new Map(rows.map(row=>[row.id,row]));
  let changed=false;
  const merged=local.filter(q=>{if(byId.get(q.id)?.deleted){changed=true;return false;}return true;}).map(q=>{
    const row=byId.get(q.id);
    if (!row || row.version <= (q.sync_version ?? -1)) return q;
    changed=true;
    return {...q,...row.patch,sync_version:row.version};
  });
  const existing = new Set(local.map(q=>q.id));
  for(const row of rows) if(!row.deleted && !existing.has(row.id) && row.patch.id && Object.hasOwn(row.patch,'enunciado')) {merged.push({...row.patch,sync_version:row.version} as Question);changed=true;}
  return changed ? merged : local;
}
