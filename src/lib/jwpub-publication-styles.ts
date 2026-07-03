const STYLE_ID = 'jcs-jwpub-publication-css';

export function applyPublicationCss(container: HTMLElement, css?: string) {
  const host = container.parentElement;
  host?.querySelector(`#${STYLE_ID}`)?.remove();

  if (css?.trim()) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    container.before(style);
    container.classList.add('jwpub-has-styles');
    return;
  }

  container.classList.remove('jwpub-has-styles');
}
