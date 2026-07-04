export type TalkThemeCardInput = {
  themeNumber: number | null;
  themeTitle: string;
  speakerName: string;
  congregation: string;
  songNumber: number;
  songTitle: string;
  jwOrgFinderUrl: string;
  jwLibraryUrl: string;
  jwLibraryAndroidIntentUrl: string;
  lang?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export const TALK_THEME_CARD_STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --ink: #f4f0e8;
      --ink-muted: rgba(244, 240, 232, 0.72);
      --ink-soft: rgba(244, 240, 232, 0.48);
      --gold: #c9a962;
      --gold-light: #e8d5a3;
      --navy: #1a2744;
      --navy-deep: #0f1829;
      --stroke: rgba(201, 169, 98, 0.28);
    }

    html, body {
      min-height: 100%;
      font-family: 'DM Sans', system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(ellipse 120% 80% at 50% -20%, rgba(201, 169, 98, 0.14), transparent 55%),
        radial-gradient(ellipse 80% 60% at 100% 100%, rgba(74, 108, 160, 0.18), transparent 50%),
        linear-gradient(165deg, var(--navy-deep) 0%, var(--navy) 45%, #243552 100%);
      -webkit-font-smoothing: antialiased;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px 40px;
    }

    .scene { width: min(100%, 420px); }

    .card {
      position: relative;
      border-radius: 28px;
      padding: 28px 24px 24px;
      background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
      border: 1px solid var(--stroke);
      box-shadow:
        0 32px 64px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.012) 2px,
          rgba(255,255,255,0.012) 3px
        );
      pointer-events: none;
    }

    .card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 24px;
      right: 24px;
      height: 3px;
      border-radius: 0 0 4px 4px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      opacity: 0.85;
    }

    .inner { position: relative; z-index: 1; }

    .eyebrow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 22px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      background: rgba(201, 169, 98, 0.12);
      border: 1px solid rgba(201, 169, 98, 0.35);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--gold-light);
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gold);
      box-shadow: 0 0 10px rgba(201, 169, 98, 0.6);
    }

    .label-top {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink-soft);
      text-align: right;
    }

    .theme-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(1.65rem, 5.2vw, 2rem);
      font-weight: 600;
      line-height: 1.28;
      letter-spacing: -0.01em;
      color: var(--ink);
      margin-bottom: 28px;
    }

    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--stroke), transparent);
      margin-bottom: 22px;
    }

    .meta-grid { display: grid; gap: 14px; margin-bottom: 22px; }
    .meta-item { display: grid; gap: 4px; }

    .meta-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .meta-value {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--ink);
    }

    .cantico-link {
      display: block;
      width: 100%;
      text-decoration: none;
      color: inherit;
      border: none;
      cursor: pointer;
      font: inherit;
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }

    .cantico {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 18px 18px 16px;
      border-radius: 20px;
      background: linear-gradient(135deg, #f7f3ea 0%, #efe8da 100%);
      border: 1px solid rgba(201, 169, 98, 0.45);
      transition: transform 0.18s ease, border-color 0.18s ease;
    }

    .cantico-link:hover .cantico,
    .cantico-link:focus-visible .cantico {
      transform: translateY(-1px);
      border-color: rgba(201, 169, 98, 0.7);
    }

    .cantico-link:active .cantico { transform: scale(0.985); }

    .cantico-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: var(--navy);
      border: 1px solid rgba(201, 169, 98, 0.35);
      color: var(--gold-light);
    }

    .cantico-icon svg { width: 22px; height: 22px; }
    .cantico-body { flex: 1; min-width: 0; }

    .cantico-kicker {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8a6d2b;
      margin-bottom: 4px;
    }

    .cantico-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.35rem;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 6px;
      color: var(--navy);
    }

    .cantico-hint {
      font-size: 12px;
      color: rgba(26, 39, 68, 0.68);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cantico-hint svg { width: 14px; height: 14px; opacity: 0.75; }

    .cantico-arrow {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(26, 39, 68, 0.08);
      color: var(--navy);
    }

    .footer-note {
      margin-top: 18px;
      text-align: center;
      font-size: 11px;
      color: var(--ink-soft);
      letter-spacing: 0.04em;
    }

    @media (prefers-reduced-motion: reduce) {
      .cantico-link:hover .cantico,
      .cantico-link:active .cantico { transform: none; }
    }
`;

const TALK_THEME_CARD_PDF_STYLES = `
    @page {
      size: 110mm 195mm;
      margin: 10mm;
    }

    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      min-height: auto;
      padding: 0;
    }

    .scene { width: 100%; max-width: none; }
`;

function buildCanticoBlock(input: TalkThemeCardInput, forPdf: boolean, songAria: string) {
  const inner = `
            <div class="cantico">
            <div class="cantico-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
            </div>
            <div class="cantico-body">
              <p class="cantico-kicker">Cântico nº ${escapeHtml(String(input.songNumber))}</p>
              <p class="cantico-title">${escapeHtml(input.songTitle)}</p>
              <p class="cantico-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Toque para abrir no JW Library (edição digital)
              </p>
            </div>
            <div class="cantico-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>`;

  if (forPdf) {
    return `<div class="cantico-link" id="pdf-cantico-target" role="link" tabindex="0" aria-label="${escapeHtml(songAria)}">${inner}
        </div>`;
  }

  return `<button type="button" class="cantico-link" id="open-cantico" aria-label="${escapeHtml(songAria)}">${inner}
        </button>`;
}

export function composeTalkThemeCardHtml(
  input: TalkThemeCardInput,
  options?: { forPdf?: boolean },
): string {
  const forPdf = options?.forPdf === true;
  const badgeLabel = input.themeNumber ? `Tema ${input.themeNumber}` : 'Discurso';
  const pageTitle = input.themeNumber
    ? `Tema ${input.themeNumber} — Cartão de Discurso`
    : 'Cartão de Discurso';
  const songAria = `Abrir Cântico ${input.songNumber} no JW Library — edição digital`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1a2744">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
  <style>${TALK_THEME_CARD_STYLES}${forPdf ? TALK_THEME_CARD_PDF_STYLES : ''}
  </style>
</head>
<body>
  <main class="scene">
    <article class="card">
      <div class="inner">
        <header class="eyebrow">
          <div class="badge">
            <span class="badge-dot" aria-hidden="true"></span>
            ${escapeHtml(badgeLabel)}
          </div>
          <p class="label-top">Discurso</p>
        </header>

        <h1 class="theme-title">${escapeHtml(input.themeTitle)}</h1>

        <div class="divider" aria-hidden="true"></div>

        <section class="meta-grid" aria-label="Informações do discurso">
          <div class="meta-item">
            <span class="meta-label">Orador</span>
            <span class="meta-value">${escapeHtml(input.speakerName)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Congregação</span>
            <span class="meta-value">${escapeHtml(input.congregation)}</span>
          </div>
        </section>

        ${buildCanticoBlock(input, forPdf, songAria)}

        <p class="footer-note">Cartão digital para reunião</p>
      </div>
    </article>
  </main>

  ${
    forPdf
      ? ''
      : `<script>
    (function () {
      var LINKS = [
        '${escapeJsString(input.jwOrgFinderUrl)}',
        '${escapeJsString(input.jwLibraryUrl)}',
      ];

      function tryOpenCantico(index) {
        if (index >= LINKS.length) return;
        window.location.href = LINKS[index];
        window.setTimeout(function () {
          if (document.visibilityState !== 'hidden') {
            tryOpenCantico(index + 1);
          }
        }, 900);
      }

      document.getElementById('open-cantico').addEventListener('click', function () {
        tryOpenCantico(0);
      });
    })();
  </script>`
  }
</body>
</html>`;
}

export function suggestTalkThemeCardFileName(
  input: {
    themeNumber: number | null;
    speakerName: string;
  },
  format: 'html' | 'pdf' = 'html',
): string {
  const themePart = input.themeNumber ? `Tema-${input.themeNumber}` : 'Discurso';
  const firstName =
    input.speakerName
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^\p{L}\p{N}-]/gu, '') || 'Orador';
  return `${themePart}-${firstName}.${format}`;
}
