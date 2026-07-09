export function formatUnknownError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message?.trim() || fallback;
  }
  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
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
