// Scheduled, read-only Apex source access. Writes only the curation mirror.
// Authentication uses a single-use token issued by the curation database.
import {synchronizeApex} from './sync.ts';
declare const Deno: {
 serve(handler:(request:Request)=>Response|Promise<Response>):void;
 env:{get(name:string):string|undefined};
};
Deno.serve(async request=>{
 if(request.method!=='POST') return new Response(null,{status:405});
 const token=request.headers.get('x-apex-sync-token');
 if(!token||!/^[a-f0-9]{64}$/.test(token)) return new Response(null,{status:401});
 const url=Deno.env.get('SUPABASE_URL');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const apexKey=Deno.env.get('APEX_SERVICE_ROLE_KEY');
 if(!url||!key||!apexKey) return Response.json({error:'Configuração de sincronização indisponível.'},{status:503});
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Curation RPC ${name}: ${response.status}`);
  return response.status===204?null:response.json();
 };
 let run:string|null=null;
 try {
  run=await rpc('curation_apex_begin',{p_token:token});
  if(!run) return new Response(null,{status:401});
  const result=await synchronizeApex(Deno.env.get('APEX_SUPABASE_URL')??'https://beedxpjaufgujusyuziq.supabase.co',apexKey,rpc,run);
  return Response.json(result);
 } catch(error) {
  console.warn('[sync-apex-questions]',(error as Error).message);
  if(run) await rpc('curation_apex_fail',{p_run:run}).catch(()=>{});
  return Response.json({error:'Falha na sincronização Apex.'},{status:502});
 }
});
