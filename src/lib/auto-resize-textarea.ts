export function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.jcsStableField === '1') return;
  if (textarea.offsetParent === null && getComputedStyle(textarea).display === 'none') return;

  const computedMin = Number.parseInt(getComputedStyle(textarea).minHeight, 10);
  const min = Number.isFinite(computedMin) ? Math.max(44, computedMin) : 44;
  const next = `${Math.max(min, textarea.scrollHeight)}px`;
  if (textarea.style.height === next) return;
  textarea.style.height = `${min}px`;
  textarea.style.height = `${Math.max(min, textarea.scrollHeight)}px`;
}

export function setupAutoResizeTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.jcsStableField === '1') return () => {};

  const resize = (event?: Event) => {
    if (event && 'isComposing' in event && (event as InputEvent).isComposing) return;
    autoResizeTextarea(textarea);
  };

  textarea.addEventListener('input', resize);
  textarea.addEventListener('compositionend', resize);
  requestAnimationFrame(() => autoResizeTextarea(textarea));

  return () => {
    textarea.removeEventListener('input', resize);
    textarea.removeEventListener('compositionend', resize);
  };
}
