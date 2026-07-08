import type { ChairmanAssignment, ChairmanPrepRecord } from '../shared/chairman-prep-types';
import { ensureOpeningPreview } from '../shared/chairman-opening-preview';
import { isStudentAssignment } from '../shared/chairman-student-part';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionLabel(section: ChairmanAssignment['section']) {
  switch (section) {
    case 'tesouros':
      return 'Tesouros da Palavra de Deus';
    case 'ministerio':
      return 'Faça seu melhor no ministério';
    case 'vida':
      return 'Nossa vida cristã';
    case 'abertura':
      return 'Abertura';
    case 'encerramento':
      return 'Encerramento';
    case 'musica':
      return 'Cântico';
    default:
      return section;
  }
}

function sectionColor(section: ChairmanAssignment['section']) {
  switch (section) {
    case 'tesouros':
      return '#2563eb';
    case 'ministerio':
      return '#b45309';
    case 'vida':
      return '#9f1239';
    default:
      return '#4b5563';
  }
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function buildChairmanPrepHtml(
  record: ChairmanPrepRecord,
  options?: { tablet?: boolean },
) {
  const tablet = options?.tablet ?? false;
  const content = record.content;
  const headerDate = record.meetingDate || record.weekLabel;
  const reading = record.bibleReading;
  const chairman = record.chairmanName || 'Presidente';

  const sections: string[] = [];

  sections.push(`<header class="doc-header">
    <h1>Folha do presidente — Reunião do meio de semana</h1>
    <p class="meta">${escapeHtml(headerDate)} · ${escapeHtml(reading)}</p>
    <p class="meta">Presidente: <strong>${escapeHtml(chairman)}</strong>${record.congregation ? ` · ${escapeHtml(record.congregation)}` : ''}</p>
    ${record.openingPrayer ? `<p class="meta">Oração inicial: ${escapeHtml(record.openingPrayer)}</p>` : ''}
  </header>`);

  if (content) {
    const preview = ensureOpeningPreview(
      content.openingSummary,
      record.assignments,
      content.openingPreview,
    );
    const hasStructured =
      preview.treasuresHighlight.trim() || preview.lifeChristianHighlight.trim();

    if (hasStructured) {
      sections.push(`<section class="block opening-block">
      <h2>Comentários iniciais (~1 min)</h2>
      ${preview.intro?.trim() ? `<p class="opening-intro">${nl2br(preview.intro)}</p>` : ''}
      <div class="opening-highlight treasures">
        <h3>Tesouros da Palavra de Deus — discurso (parte 1)</h3>
        ${preview.treasuresPartTitle ? `<p class="opening-part-title">${escapeHtml(preview.treasuresPartTitle)}</p>` : ''}
        <p>${nl2br(preview.treasuresHighlight || '—')}</p>
      </div>
      <div class="opening-highlight life">
        <h3>Nossa vida cristã</h3>
        ${preview.lifeChristianPartTitle ? `<p class="opening-part-title">${escapeHtml(preview.lifeChristianPartTitle)}</p>` : ''}
        <p>${nl2br(preview.lifeChristianHighlight || '—')}</p>
      </div>
    </section>`);
    } else if (content.openingSummary) {
      sections.push(`<section class="block">
      <h2>Comentários iniciais (~1 min)</h2>
      <p>${nl2br(content.openingSummary)}</p>
    </section>`);
    }
  }

  let currentSection: ChairmanAssignment['section'] | null = null;
  for (const assignment of record.assignments) {
    if (assignment.section !== currentSection) {
      currentSection = assignment.section;
      if (['tesouros', 'ministerio', 'vida'].includes(currentSection)) {
        sections.push(
          `<h2 class="section-banner" style="background:${sectionColor(currentSection)}">${escapeHtml(sectionLabel(currentSection))}</h2>`,
        );
      }
    }

    const partContent = content?.parts.find((p) => p.assignmentId === assignment.id);
    const names = assignment.assignees.length ? assignment.assignees.join(' · ') : '—';
    const duration = assignment.durationMin ? ` (${assignment.durationMin} min)` : '';

    sections.push(`<section class="part">
      <div class="part-head">
        <h3>${escapeHtml(assignment.partTitle)}${escapeHtml(duration)}</h3>
        <span class="assignee">${escapeHtml(names)}</span>
      </div>
      ${partContent?.lessonRef || partContent?.lessonSummary ? `<div class="lesson-box">
        ${partContent.lessonRef ? `<p class="lesson-ref"><strong>Lição:</strong> ${escapeHtml(partContent.lessonRef)}</p>` : ''}
        ${partContent.lessonSummary ? `<p class="lesson-summary"><strong>Pontos principais:</strong> ${nl2br(partContent.lessonSummary)}</p>` : ''}
      </div>` : ''}
      ${partContent?.highlight && !partContent?.lessonSummary ? `<p class="highlight"><strong>Destaque:</strong> ${nl2br(partContent.highlight)}</p>` : ''}
      ${partContent?.highlight && partContent?.lessonSummary && partContent.highlight !== partContent.lessonSummary ? `<p class="highlight"><strong>Considerar:</strong> ${nl2br(partContent.highlight)}</p>` : ''}
      ${partContent?.transition ? `<p class="transition"><strong>Comentário na reunião:</strong> ${nl2br(partContent.transition)}</p>` : ''}
      ${partContent?.privateSuggestion ? `<p class="private-note"><strong>Conversa particular com o estudante:</strong> ${nl2br(partContent.privateSuggestion)}</p>` : ''}
    </section>`);
  }

  if (content?.closingSummary) {
    sections.push(`<section class="block">
      <h2>Comentários finais — visão geral</h2>
      <p>${nl2br(content.closingSummary)}</p>
    </section>`);
  }

  if (content?.finalQuestion) {
    const options = content.finalQuestionOptions
      .map((opt, i) => `<li>${escapeHtml(opt)}</li>`)
      .join('');
    sections.push(`<section class="block question">
      <h2>Pergunta final</h2>
      <p>${escapeHtml(content.finalQuestion)}</p>
      <ol>${options}</ol>
    </section>`);
  }

  if (record.closingPrayer) {
    sections.push(`<p class="meta closing-prayer">Oração final: ${escapeHtml(record.closingPrayer)}</p>`);
  }

  sections.push(`<section class="block announcements">
      <h2>Anúncios</h2>
      ${record.announcements?.trim() ? `<p class="announcements-text">${nl2br(record.announcements)}</p>` : ''}
      <div class="handwrite-space" aria-hidden="true"></div>
    </section>`);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  ${tablet ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ''}
  <title>Folha do presidente — ${escapeHtml(record.weekLabel)}</title>
  <style>
    body {
      font-family: 'Segoe UI', Calibri, sans-serif;
      font-size: ${tablet ? '18px' : '11pt'};
      line-height: ${tablet ? '1.55' : '1.5'};
      margin: ${tablet ? '12px 14px' : '1.6cm 1.8cm'};
      color: #1f2937;
    }
    .doc-header { margin-bottom: 1.2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.8em; }
    h1 { font-size: ${tablet ? '22px' : '16pt'}; margin: 0 0 0.35em; color: #111827; }
    h2 { font-size: ${tablet ? '17px' : '12pt'}; margin: 1em 0 0.5em; color: #374151; }
    h2.section-banner {
      color: #fff;
      padding: 0.35em 0.65em;
      border-radius: 4px;
      font-size: ${tablet ? '14px' : '10pt'};
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 1.2em;
    }
    .meta { font-size: ${tablet ? '14px' : '10pt'}; color: #6b7280; margin: 0.2em 0; }
    .block { margin-bottom: 1em; }
    .opening-block .opening-intro { margin-bottom: 0.85em; }
    .opening-highlight {
      margin: 0.65em 0;
      padding: 0.55em 0.75em;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .opening-highlight.treasures {
      border-left: 4px solid #2563eb;
      background: #eff6ff;
    }
    .opening-highlight.life {
      border-left: 4px solid #9f1239;
      background: #fff1f2;
    }
    .opening-highlight h3 {
      font-size: ${tablet ? '14px' : '10pt'};
      margin: 0 0 0.25em;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .opening-highlight.treasures h3 { color: #1d4ed8; }
    .opening-highlight.life h3 { color: #9f1239; }
    .opening-part-title {
      font-size: ${tablet ? '16px' : '10pt'};
      font-weight: 600;
      margin: 0 0 0.35em;
      color: #374151;
    }
    .part {
      margin: 0.65em 0 0.85em;
      padding: 0.55em 0.75em;
      border-left: 3px solid #d1d5db;
      background: #f9fafb;
      page-break-inside: avoid;
    }
    .part-head { display: flex; justify-content: space-between; gap: 1em; align-items: flex-start; }
    .part h3 { font-size: ${tablet ? '17px' : '11pt'}; margin: 0; flex: 1; }
    .assignee {
      font-size: ${tablet ? '13px' : '9.5pt'};
      font-weight: 600;
      color: #6d28d9;
      white-space: nowrap;
      background: #ede9fe;
      padding: 0.15em 0.5em;
      border-radius: 999px;
    }
    .highlight { margin: 0.45em 0 0; font-size: ${tablet ? '16px' : '10.5pt'}; }
    .lesson-box {
      margin: 0.5em 0;
      padding: 0.45em 0.65em;
      background: #fffbeb;
      border-left: 3px solid #b45309;
      font-size: ${tablet ? '16px' : '10.5pt'};
    }
    .lesson-ref { margin: 0 0 0.35em; font-weight: 600; color: #92400e; }
    .private-note {
      margin: 0.45em 0 0;
      padding: 0.4em 0.55em;
      background: #f3f4f6;
      border: 1px dashed #9ca3af;
      font-size: ${tablet ? '15px' : '10pt'};
    }
    .transition { margin: 0.35em 0 0; }
    .question ol { margin: 0.4em 0 0 1.2em; }
    .closing-prayer { margin-top: 1.5em; }
    .announcements { margin-top: 1.5em; page-break-inside: avoid; }
    .announcements-text { margin-bottom: 0.5em; }
    .handwrite-space {
      min-height: 5cm;
      margin-top: 0.35em;
      border: 1px dashed #9ca3af;
      border-radius: 4px;
      background: repeating-linear-gradient(
        to bottom,
        #fff 0,
        #fff 1.35em,
        #e5e7eb 1.35em,
        #e5e7eb calc(1.35em + 1px)
      );
    }
    p { margin: 0 0 0.5em; }
  </style>
</head>
<body>
  ${sections.join('\n')}
</body>
</html>`;
}
