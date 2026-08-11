export function formatUnknownError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message?.trim() || fallback;
  }
  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    if (record.name === 'ErrnoError') {
      const errno = record.errno ?? record.Pa;
      if (errno === 33) {
        return 'Não foi possível acessar o arquivo da publicação ou gravar na pasta de exportação. Verifique se o Google Drive está sincronizado e tente de novo.';
      }
      return `Erro de arquivo do sistema (código ${String(errno)}). Tente exportar de novo ou escolha outra pasta.`;
    }
    if ('message' in record) {
      const message = record.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }
  }
  try {
    const serialized = JSON.stringify(err);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}
