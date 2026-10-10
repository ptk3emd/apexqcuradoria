import { Question } from '../types/question';

/**
 * Formats question into an optimized medical prompt for pasting into AI (Gemini, ChatGPT) or Google search
 */
export function formatQuestionForAiPrompt(q: Question): string {
  const parts: string[] = [];

  parts.push(`--- QUESTÃO MÉDICA [${q.origem || 'ENARE'} ${q.ano || '2022'}] ---`);
  parts.push(`Especialidade: ${q.especialidade || q.categoria || 'Geral'}`);
  if (q.tema_especifico) {
    parts.push(`Tema: ${q.tema_especifico}`);
  }
  parts.push('');
  parts.push(`ENUNCIADO:`);
  parts.push(q.enunciado || '');
  parts.push('');
  parts.push(`ALTERNATIVAS:`);
  if (q.a) parts.push(`A) ${q.a}`);
  if (q.b) parts.push(`B) ${q.b}`);
  if (q.c) parts.push(`C) ${q.c}`);
  if (q.d) parts.push(`D) ${q.d}`);
  if (q.e) parts.push(`E) ${q.e}`);
  parts.push('');
  parts.push(`GABARITO OFICIAL: ${q.correta || 'Não informado'}`);

  if (q.comentario) {
    parts.push('');
    parts.push(`COMENTÁRIO DO PROFESSOR:`);
    parts.push(q.comentario);
  }

  const hasJustificativas = q.justificativa_a || q.justificativa_b || q.justificativa_c || q.justificativa_d || q.justificativa_e;
  if (hasJustificativas) {
    parts.push('');
    parts.push(`JUSTIFICATIVAS POR ALTERNATIVA:`);
    if (q.justificativa_a) parts.push(`A: ${q.justificativa_a}`);
    if (q.justificativa_b) parts.push(`B: ${q.justificativa_b}`);
    if (q.justificativa_c) parts.push(`C: ${q.justificativa_c}`);
    if (q.justificativa_d) parts.push(`D: ${q.justificativa_d}`);
    if (q.justificativa_e) parts.push(`E: ${q.justificativa_e}`);
  }

  return parts.join('\n');
}

/**
 * Copies string to clipboard with fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.warn('Clipboard copy failed:', err);
    return false;
  }
}
