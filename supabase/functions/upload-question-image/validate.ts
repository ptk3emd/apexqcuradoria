// Pure checks for the `upload-question-image` Edge Function. Kept free of any
// Deno API so the repository's Node tests can run them (tests/uploadQuestionImage.test.ts).

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const BUCKET = 'question-images';
export const DEFAULT_APEX_URL = 'https://beedxpjaufgujusyuziq.supabase.co';

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

/**
 * Is this really a WebP file? The browser's declared type is not trusted: the
 * RIFF container, the declared size and the first chunk have to match.
 */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 30) return false;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WEBP') return false;
  const declared = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] * 2 ** 24);
  // RIFF sizes count everything after the first 8 bytes; one pad byte is allowed.
  if (declared + 8 > bytes.length || declared + 8 < bytes.length - 1) return false;
  return ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(bytes, 12, 16));
}

/** The question id from the request header: a positive integer, nothing else. */
export function parseQuestionId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : null;
}

/** `<question id>/<uuid>.webp`: a random name, never derived from the upload. */
export function buildObjectPath(questionId: number, uuid: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error('uuid inválido');
  return `${questionId}/${uuid.toLowerCase()}.webp`;
}

export function publicUrl(apexUrl: string, path: string): string {
  return `${apexUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Same address the database CHECK accepts (questions_imagem_storage_check). */
export const STORAGE_URL_PATTERN =
  /^https:\/\/beedxpjaufgujusyuziq\.supabase\.co\/storage\/v1\/object\/public\/question-images\/[A-Za-z0-9._/-]+\.webp$/;
