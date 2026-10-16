// Turns a failed request into a sentence a curator can act on. Server messages
// that are already written for people (pt-BR, from the curation RPCs) pass
// through; network, session and database noise is replaced.
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return 'Algo deu errado. Tente de novo.';
  if (/failed to fetch|networkerror|network request failed|load failed|timeout|aborted/i.test(raw)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  if (/sessão expirada|não autorizado|jwt|invalid.*token|permission denied/i.test(raw)) {
    return 'Sua sessão expirou. Entre de novo com a senha mestra.';
  }
  if (/pgrst|sqlstate|duplicate key|violates|syntax error|\b\d{5}\b/i.test(raw)) {
    return 'O servidor recusou a operação. Recarregue a página e tente de novo.';
  }
  return raw;
}
