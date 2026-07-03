/** Converte HTML do esboço (.jwpub) em texto editável, preservando parágrafos. */
export function outlineHtmlToPlainText(html: string): string {
  if (typeof document === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const host = document.createElement('div');
  host.className = 'jwpub-content';
  host.innerHTML = html;
  const text = host.innerText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}
