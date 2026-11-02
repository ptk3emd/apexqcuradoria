// Read-only bridge: validate the curation password session before reading only
// open PUBLIC-bank quarantine IDs. Reuses the image-upload Apex secrets.
declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
  env: { get(name: string): string | undefined };
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-apex-session',
};
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: {...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
});
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
  if (request.method !== 'GET') return reply(405, {error: 'Método não permitido.'});
  const session = request.headers.get('x-apex-session');
  if (!session) return reply(401, {error: 'Sessão expirada. Entre novamente com a senha mestra.'});
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anon) return reply(500, {error: 'Função sem configuração do projeto.'});
    const headers: Record<string, string> = {apikey: anon, 'Content-Type': 'application/json', 'x-apex-session': session};
    if (anon.split('.').length === 3) headers.Authorization = `Bearer ${anon}`;
    const auth = await fetch(`${url}/rest/v1/rpc/curation_session`, {
      method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) {
      const detail = await auth.json().catch(() => ({}));
      return /Sessão expirada|não autorizado/i.test(String(detail.message ?? ''))
        ? reply(401, {error: 'Sessão expirada. Entre novamente com a senha mestra.'})
        : reply(502, {error: 'Não foi possível validar a sessão.'});
    }
    const actor = await auth.json();
    if (!['patrick', 'lucas', 'thierry'].includes(actor.curator_id)) return reply(403, {error: 'Acesso restrito à curadoria.'});
    const apexUrl = Deno.env.get('APEX_SUPABASE_URL') ?? 'https://beedxpjaufgujusyuziq.supabase.co';
    const key = Deno.env.get('APEX_SERVICE_ROLE_KEY');
    if (!key) return reply(503, {error: 'Conexão com a quarentena Apex não configurada.'});
    const ids = new Set<string>();
    // Keyset pagination avoids the Data API row limit and never returns private
    // professor questions, reviewer identities, or proposed medical content.
    let after = '0';
    while (true) {
      const query = new URLSearchParams({select: 'public_question_id', question_source: 'eq.public',
        resolved_at: 'is.null', public_question_id: `gt.${after}`, order: 'public_question_id.asc', limit: '500'});
      const response = await fetch(`${apexUrl.replace(/\/+$/, '')}/rest/v1/question_quarantine?${query}`, {
        headers: {apikey: key, Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        console.warn('[question-quarantine] source refused', response.status);
        return reply(502, {error: 'Não foi possível consultar a quarentena Apex.'});
      }
      const rows = await response.json() as {public_question_id: string | number}[];
      if (!Array.isArray(rows)) throw new Error('Invalid quarantine response');
      for (const row of rows) {
        const id = String(row.public_question_id);
        if (!/^[1-9][0-9]*$/.test(id)) throw new Error('Invalid question id');
        ids.add(id);
      }
      if (rows.length === 0) break;
      const last = String(rows[rows.length - 1].public_question_id);
      if (BigInt(last) <= BigInt(after)) throw new Error('Invalid pagination');
      after = last;
    }
    return reply(200, {ids: [...ids], checkedAt: new Date().toISOString()});
  } catch (error) {
    console.warn('[question-quarantine]', (error as Error).name);
    return reply(502, {error: 'Não foi possível atualizar a quarentena Apex. Tente novamente.'});
  }
});
