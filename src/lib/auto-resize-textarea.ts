export function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function setupAutoResizeTextarea(textarea: HTMLTextAreaElement) {
  const resize = () => autoResizeTextarea(textarea);

  textarea.addEventListener('input', resize);

  const observer = new ResizeObserver(resize);
  observer.observe(textarea);

  requestAnimationFrame(resize);

  return () => {
    textarea.removeEventListener('input', resize);
    observer.disconnect();
  };
}
