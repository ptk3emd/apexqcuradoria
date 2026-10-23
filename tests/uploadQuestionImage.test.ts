import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKET, DEFAULT_APEX_URL, MAX_IMAGE_BYTES, STORAGE_URL_PATTERN,
  buildObjectPath, isWebp, parseQuestionId, publicUrl,
} from '../supabase/functions/upload-question-image/validate.ts';

// A minimal but structurally valid WebP: RIFF header, WEBP, one VP8L chunk.
function webp(payload = 40, chunk = 'VP8L'): Uint8Array {
  const body = new Uint8Array(payload);
  const total = 12 + 8 + body.length;
  const out = new Uint8Array(total);
  const text = (at: number, value: string) => [...value].forEach((ch, i) => { out[at + i] = ch.charCodeAt(0); });
  text(0, 'RIFF');
  new DataView(out.buffer).setUint32(4, total - 8, true);
  text(8, 'WEBP');
  text(12, chunk);
  new DataView(out.buffer).setUint32(16, body.length, true);
  out.set(body, 20);
  return out;
}

test('a structurally valid WebP is accepted, whichever of the three codecs it uses', () => {
  for (const chunk of ['VP8 ', 'VP8L', 'VP8X']) assert.equal(isWebp(webp(40, chunk)), true, chunk);
});

test('anything that only claims to be a WebP is refused', () => {
  const png = new Uint8Array(64); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(isWebp(png), false);
  assert.equal(isWebp(new Uint8Array(0)), false);
  assert.equal(isWebp(webp().slice(0, 20)), false, 'too short');
  const wrongSize = webp(); new DataView(wrongSize.buffer).setUint32(4, 9999, true);
  assert.equal(isWebp(wrongSize), false, 'declared size does not match the file');
  const truncated = webp(80).slice(0, 60);
  assert.equal(isWebp(truncated), false, 'cut off');
  assert.equal(isWebp(webp(40, 'JUNK')), false, 'unknown first chunk');
  const notWebp = webp(); notWebp[8] = 'X'.charCodeAt(0);
  assert.equal(isWebp(notWebp), false, 'not a WEBP form');
});

test('the question id is a plain positive integer', () => {
  assert.equal(parseQuestionId('123'), 123);
  assert.equal(parseQuestionId(' 7 '), 7);
  for (const bad of [null, undefined, '', '0', '-1', '01', '1.5', '1e3', '12a', '9007199254740993', '1;drop table']) {
    assert.equal(parseQuestionId(bad as string | null | undefined), null, String(bad));
  }
});

test('the stored name is the question id and a random uuid, nothing from the upload', () => {
  const uuid = '3F2A9C1E-6C1B-4A0E-9A53-7D2B8F5E1A10';
  assert.equal(buildObjectPath(12, uuid), '12/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp');
  assert.throws(() => buildObjectPath(12, '../../etc/passwd'), /uuid/);
});

test('the public address matches what the database accepts, and nothing else does', () => {
  const url = publicUrl(DEFAULT_APEX_URL + '/', buildObjectPath(12, '3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10'));
  assert.equal(url, `${DEFAULT_APEX_URL}/storage/v1/object/public/${BUCKET}/12/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp`);
  assert.match(url, STORAGE_URL_PATTERN);
  for (const bad of [
    'https://exemplo.com/a.webp',
    `${DEFAULT_APEX_URL}/storage/v1/object/public/professor-question-images/a/b.webp`,
    url.replace('.webp', '.png'),
    url.replace('https:', 'http:'),
    `${url}?x=1`,
  ]) assert.doesNotMatch(bad, STORAGE_URL_PATTERN, bad);
});

test('the size limit is 2 MB', () => {
  assert.equal(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
});

import {APEX_IMAGE_PATTERN, fitWithin, imageProblem} from '../src/lib/questionImage.ts';

const GOOD = `${DEFAULT_APEX_URL}/storage/v1/object/public/${BUCKET}/12/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp`;

test('the browser and the Edge Function accept exactly the same addresses', () => {
  assert.equal(APEX_IMAGE_PATTERN.source, STORAGE_URL_PATTERN.source);
});

test('imageProblem: blank means no figure; a figure needs the bucket address and a description', () => {
  assert.equal(imageProblem(null, null), null);
  assert.equal(imageProblem('', 'sobrou'), null);
  assert.equal(imageProblem('   ', undefined), null);
  assert.equal(imageProblem(GOOD, 'ECG com supradesnivelamento de ST'), null);
  assert.match(imageProblem('https://exemplo.com/a.webp', 'x') ?? '', /botão de imagem/);
  assert.match(imageProblem(GOOD, '') ?? '', /Descreva a imagem/);
  assert.match(imageProblem(GOOD, '   ') ?? '', /Descreva a imagem/);
  assert.match(imageProblem(GOOD, 'a'.repeat(501)) ?? '', /até 500 caracteres/);
  assert.equal(imageProblem(GOOD, 'a'.repeat(500)), null);
});

test('fitWithin shrinks the longest side to 2000 px and never upscales', () => {
  assert.deepEqual(fitWithin(4000, 2000), {width: 2000, height: 1000});
  assert.deepEqual(fitWithin(1000, 3000), {width: 667, height: 2000});
  assert.deepEqual(fitWithin(800, 600), {width: 800, height: 600});
});
