import { ipcRenderer } from 'electron';

function isJwDownloadHref(href) {
  if (!href || href === 'about:blank' || href.startsWith('blob:')) return false;
  const lower = href.toLowerCase();
  if (lower.includes('jw-cdn.org') || lower.includes('.jwpub')) return true;
  return /docs\.jw\.org/i.test(lower) && /download|fileformat=jwpub|format=jwpub|pub-media|getpubmedialinks/i.test(lower);
}

function isJwpubFileResponse(url, contentType, disposition) {
  const lowerUrl = (url ?? '').toLowerCase();
  const lowerType = (contentType ?? '').toLowerCase();
  const lowerDisp = (disposition ?? '').toLowerCase();
  if (lowerDisp.includes('.pdf') || lowerDisp.includes('.docx') || lowerDisp.includes('.rtf')) return false;
  if (lowerUrl.includes('.jwpub') || lowerDisp.includes('.jwpub') || lowerType.includes('jwpub')) return true;
  if (/jw-cdn\.org/i.test(lowerUrl) && lowerDisp.includes('attachment')) return true;
  return false;
}

function requestCapture(href) {
  void ipcRenderer.invoke('jcs:jw-browser-capture-url', href);
}

function hookClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
  if (!isJwDownloadHref(anchor.href)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  requestCapture(anchor.href);
}

window.addEventListener('click', hookClick, true);

const nativeOpen = window.open.bind(window);
window.open = (url, target, features) => {
  const href = typeof url === 'string' ? url : url?.toString?.() ?? '';
  if (href && isJwDownloadHref(href)) {
    requestCapture(href);
    return null;
  }
  return nativeOpen(url, target, features);
};

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  const responseUrl = response.url || (typeof input === 'string' ? input : input?.url ?? '');
  const contentType = response.headers.get('content-type') ?? '';
  const disposition = response.headers.get('content-disposition') ?? '';
  if (response.ok && isJwpubFileResponse(responseUrl, contentType, disposition) && isJwDownloadHref(responseUrl)) {
    requestCapture(responseUrl);
  }
  return response;
};

const nativeCreateElement = document.createElement.bind(document);
document.createElement = function createElement(tagName, options) {
  const element = nativeCreateElement(tagName, options);
  if (typeof tagName === 'string' && tagName.toLowerCase() === 'a') {
    element.addEventListener(
      'click',
      (event) => {
        const href = element.href;
        if (href && isJwDownloadHref(href)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          requestCapture(href);
        }
      },
      true,
    );
  }
  return element;
};
