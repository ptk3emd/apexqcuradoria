// Official question figures. The file lives in the Apex project's public
// `question-images` bucket (written only by the `upload-question-image` Edge
// Function); `questions.imagem` keeps its address and `questions.imagem_legenda`
// the description, which is the alt text and the caption the student sees.

export const IMAGE_CAPTION_MAX_LENGTH = 500;
/** Longest side after conversion. Enough for an ECG strip or a radiograph on a projector. */
export const IMAGE_MAX_SIDE = 2000;
export const IMAGE_QUALITY = 0.85;
export const IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_STORED_BYTES = 2 * 1024 * 1024;

/** Same address the database CHECK (questions_imagem_storage_check) accepts. */
export const APEX_IMAGE_PATTERN =
  /^https:\/\/beedxpjaufgujusyuziq\.supabase\.co\/storage\/v1\/object\/public\/question-images\/[A-Za-z0-9._/-]+\.webp$/;

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Checks type, size and magic bytes before decoding anything. */
export async function assertAcceptedImage(file: Blob): Promise<void> {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) throw new Error('Escolha uma imagem PNG, JPG ou WebP.');
  if (!file.size || file.size > IMAGE_MAX_INPUT_BYTES) throw new Error('A imagem deve ter até 10 MB.');
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp = b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
  const ok = file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp;
  if (!ok) throw new Error('O arquivo não é uma imagem PNG, JPG ou WebP válida.');
}

/** Size that fits `max` on the longest side, never upscaling. */
export function fitWithin(width: number, height: number, max = IMAGE_MAX_SIDE): {width: number; height: number} {
  const longest = Math.max(width, height);
  if (longest <= max) return {width, height};
  const scale = max / longest;
  return {width: Math.round(width * scale), height: Math.round(height * scale)};
}

/** Decodes any accepted image and re-encodes it as WebP, at most 2000 px. */
export async function toWebp(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const {width, height} = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar a imagem neste navegador.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY));
    // Some old browsers ignore the type and hand back PNG: refuse rather than store the wrong format.
    if (!blob || blob.type !== 'image/webp') throw new Error('Este navegador não converte imagens para WebP. Use Chrome, Edge, Firefox ou Safari atualizados.');
    if (blob.size > IMAGE_MAX_STORED_BYTES) throw new Error('A imagem continua grande demais depois de reduzida. Recorte a área que importa e tente de novo.');
    return blob;
  } finally {
    bitmap.close?.();
  }
}

/**
 * What stops a question's figure from being saved or exported, in words for the
 * curator; null when the pair is fine. Blank means "no figure".
 */
export function imageProblem(imagem: string | null | undefined, legenda: string | null | undefined): string | null {
  const address = imagem?.trim() ?? '';
  const caption = legenda?.trim() ?? '';
  if (!address) return null;
  if (!APEX_IMAGE_PATTERN.test(address)) return 'A imagem precisa ser enviada pelo botão de imagem do editor.';
  if (!caption) return 'Descreva a imagem antes de salvar: a descrição é o texto alternativo para quem não enxerga a figura.';
  if (Array.from(caption).length > IMAGE_CAPTION_MAX_LENGTH) return `A descrição da imagem deve ter até ${IMAGE_CAPTION_MAX_LENGTH} caracteres.`;
  return null;
}
