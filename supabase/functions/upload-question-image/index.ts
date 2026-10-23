// Uploads one question figure to the Apex project's `question-images` bucket.
//
// The curation signs in with its own password session (not Supabase Auth), so
// the bucket cannot take writes from the browser. The browser sends the WebP
// here instead; this function
//   1. checks the file (size, real WebP) before anything else,
//   2. asks the curation database to vouch for the curator and the rate limit
//      (rpc curation_register_image_upload, same x-apex-session header as every
//      other call), and only then
//   3. writes the file with the Apex project's service role, which lives only
//      in this function's secrets.
//
// Secrets (supabase secrets set …, project jcbinmjiimqomjdyfdia):
//   APEX_SERVICE_ROLE_KEY   service_role key of project beedxpjaufgujusyuziq (required)
//   APEX_SUPABASE_URL       default https://beedxpjaufgujusyuziq.supabase.co
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the platform.
//
// Deploy (the function checks the curator itself, so the platform JWT check is off):
//   supabase functions deploy upload-question-image --no-verify-jwt --project-ref jcbinmjiimqomjdyfdia
//
// Request: POST, body = the WebP bytes, headers x-apex-session and x-question-id.
// Answer:  { "url": "<public address>" } or { "error": "<message in Portuguese>" }.

import { BUCKET, DEFAULT_APEX_URL, MAX_IMAGE_BYTES, buildObjectPath, isWebp, parseQuestionId, publicUrl } from './validate.ts';

declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
  env: { get(name: string): string | undefined };
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-apex-session, x-question-id',
  'Access-Control-Max-Age': '86400',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function vouchForCurator(session: string, questionId: number): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return { ok: false, status: 500, message: 'Função sem configuração do projeto.' };
  const headers: Record<string, string> = { apikey: anon, 'Content-Type': 'application/json', 'x-apex-session': session };
  if (anon.split('.').length === 3) headers.Authorization = `Bearer ${anon}`;
  const response = await fetch(`${url}/rest/v1/rpc/curation_register_image_upload`, {
    method: 'POST', headers, body: JSON.stringify({ p_question_id: questionId }),
  });
  if (response.ok) return { ok: true };
  const detail = await response.json().catch(() => ({})) as { message?: string };
  const message = String(detail.message ?? '');
  if (/Sessão expirada|não autorizado/i.test(message)) return { ok: false, status: 401, message: 'Sessão expirada. Entre novamente com a senha mestra.' };
  if (/Muitos envios/i.test(message)) return { ok: false, status: 429, message };
  if (/Questão não encontrada/i.test(message)) return { ok: false, status: 404, message };
  return { ok: false, status: 502, message: 'Não foi possível validar o envio agora. Tente novamente.' };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'Método não permitido.' });

  const session = request.headers.get('x-apex-session') ?? '';
  if (!session) return reply(401, { error: 'Sessão expirada. Entre novamente com a senha mestra.' });
  const questionId = parseQuestionId(request.headers.get('x-question-id'));
  if (questionId === null) return reply(400, { error: 'Questão inválida.' });

  // Refuse an oversized body before reading it, then check what really arrived.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_IMAGE_BYTES) return reply(413, { error: 'A imagem deve ter até 2 MB.' });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return reply(400, { error: 'Nenhuma imagem enviada.' });
  if (bytes.length > MAX_IMAGE_BYTES) return reply(413, { error: 'A imagem deve ter até 2 MB.' });
  if (!isWebp(bytes)) return reply(400, { error: 'O arquivo precisa ser uma imagem WebP.' });

  const vouched = await vouchForCurator(session, questionId);
  if (!vouched.ok) return reply(vouched.status, { error: vouched.message });

  const apexUrl = Deno.env.get('APEX_SUPABASE_URL') ?? DEFAULT_APEX_URL;
  const serviceKey = Deno.env.get('APEX_SERVICE_ROLE_KEY');
  if (!serviceKey) return reply(500, { error: 'Função sem a chave do projeto Apex.' });

  const path = buildObjectPath(questionId, crypto.randomUUID());
  const stored = await fetch(`${apexUrl.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'image/webp',
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'false',
    },
    body: bytes,
  });
  if (!stored.ok) {
    console.error('[upload-question-image] storage refused', stored.status);
    return reply(502, { error: 'Não foi possível salvar a imagem agora. Tente novamente.' });
  }
  return reply(200, { url: publicUrl(apexUrl, path) });
});
