type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;
const CONTENT='id,categoria,tema_especifico,ano,origem,enunciado,a,b,c,d,e,correta,comentario,justificativa_a,justificativa_b,justificativa_c,justificativa_d,justificativa_e,especialidade,competencias,difficulty_bucket,descritores,anulada,referencias,imagem,imagem_legenda';
export async function synchronizeApex(url:string,key:string,rpc:Rpc,run:string) {
 const get=async(table:string,query:Record<string,string>)=>{
  const response=await fetch(`${url.replace(/\/+$/,'')}/rest/v1/${table}?${new URLSearchParams(query)}`,{
   headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000),
  });
  if(!response.ok) throw new Error(`Apex ${table}: ${response.status}`);
  const rows=await response.json();
  if(!Array.isArray(rows)) throw new Error('Invalid Apex response');
  return rows;
 };
 const pages=async(table:string,select:string,column:string,extra:Record<string,string>={})=>{
  const all:any[]=[];
  let after=table==='question_quarantine'?'00000000-0000-0000-0000-000000000000':'0';
  while(true) {
   const rows=await get(table,{...extra,select,order:`${column}.asc`,[column]:`gt.${after}`,limit:'1000'});
   if(!rows.length) return all;
   all.push(...rows);
   const next=String(rows[rows.length-1][column]);
   if(table==='question_quarantine' ? !/^[a-f0-9-]{36}$/.test(next)||next<=after : !/^[1-9][0-9]*$/.test(next)||BigInt(next)<=BigInt(after)) throw new Error('Invalid Apex pagination');
   after=next;
  }
 };
 // Independent source reads must all succeed before committing a new status map.
 const results=await Promise.allSettled([
  pages('questions','id','id'),
  pages('question_lifecycle','question_id,state','question_id'),
  pages('question_quarantine','id,public_question_id,reason,resolved_at,resolution','id',{
   question_source:'eq.public',or:'(resolved_at.is.null,and(reason.eq.exclusao_proposta,resolution.eq.applied))',
  }),
 ]);
 for(const result of results) if(result.status==='rejected') throw result.reason;
 const [catalog,lifecycle,quarantines]=results.map(r=>(r as PromiseFulfilledResult<any[]>).value);
 if(!catalog.length) throw new Error('Empty source catalog');
 const states=new Map(catalog.map(row=>[String(row.id),{question_id:String(row.id),lifecycle_state:'active',quarantined:false,excluded:false,reason:null as string|null}]));
 for(const row of lifecycle) { const state=states.get(String(row.question_id)); if(state) state.lifecycle_state=row.state; }
 for(const row of quarantines) {
  const state=states.get(String(row.public_question_id));
  if(!state) continue;
  if(row.resolved_at===null) {state.quarantined=true;state.reason=row.reason;}
  if(row.reason==='exclusao_proposta'&&row.resolution==='applied') state.excluded=true;
 }
 const open=[...states.values()].filter(s=>s.quarantined).map(s=>s.question_id);
 let imported=0;
 for(let start=0;start<open.length;start+=200) {
  const missing=await rpc('curation_apex_missing',{p_ids:open.slice(start,start+200)}) as string[];
  for(let i=0;i<missing.length;i+=50) {
   const ids=missing.slice(i,i+50);
   const questions=await get('questions',{select:CONTENT,id:`in.(${ids.join(',')})`,order:'id.asc',limit:'50'});
   if(questions.length!==ids.length) throw new Error('Quarantine source question disappeared; retry on next run');
   imported+=await rpc('curation_apex_import',{p_run:run,p_questions:questions});
  }
 }
 await rpc('curation_apex_finish',{p_run:run,p_states:[...states.values()]});
 return {sourceCount:states.size,quarantined:open.length,imported};
}
