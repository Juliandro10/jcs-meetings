import { useCallback, useEffect, useMemo, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { IconChevronLeft, IconPreaching } from '@/components/Icons';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import { linkifyBibleCitationsHtml } from '@/lib/bible-citation';
import type {
  FieldServiceConsiderationContextPreview,
  FieldServiceConsiderationSuggestion,
  FieldServiceReferenceLink,
  MeetingWeek,
  ResolveLinkResult,
} from '../../electron/types';

type ElderFieldServicePageProps = {
  onBack: () => void;
};

function findWeekIndex(weeks: MeetingWeek[]) {
  const current = weeks.findIndex((week) => week.isCurrentWeek);
  return current >= 0 ? current : Math.max(0, weeks.length - 1);
}

function formatGeneratedAt(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function SuggestionBody({
  body,
  onBibleLinkClick,
}: {
  body: string;
  onBibleLinkClick: (href: string, label: string) => void;
}) {
  const html = useMemo(() => linkifyBibleCitationsHtml(body, 'all'), [body]);

  return (
    <div
      className="mt-3 text-sm leading-relaxed text-jw-text [&_a.jcs-bible-ref]:font-medium [&_a.jcs-bible-ref]:text-jw-purple [&_a.jcs-bible-ref]:hover:underline"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref');
        if (!anchor) return;
        event.preventDefault();
        const href = anchor.getAttribute('data-href');
        const label = anchor.getAttribute('data-label') ?? anchor.textContent?.trim() ?? '';
        if (href) onBibleLinkClick(href, label);
      }}
    />
  );
}

function ReferenceLinkList({
  links,
  onOpen,
}: {
  links: FieldServiceReferenceLink[];
  onOpen: (link: FieldServiceReferenceLink) => void;
}) {
  if (!links.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((link) => (
        <button
          key={`${link.href}-${link.label}`}
          type="button"
          onClick={() => onOpen(link)}
          className="rounded-full border border-jw-purple/30 bg-jw-purple-light/40 px-2.5 py-1 text-xs font-medium text-jw-purple hover:bg-jw-purple-light"
        >
          {link.label}
        </button>
      ))}
    </div>
  );
}

export function ElderFieldServicePage({ onBack }: ElderFieldServicePageProps) {
  const [weeks, setWeeks] = useState<MeetingWeek[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [preview, setPreview] = useState<FieldServiceConsiderationContextPreview | null>(null);
  const [suggestions, setSuggestions] = useState<FieldServiceConsiderationSuggestion[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);

  const week = weeks[weekIndex] ?? null;
  const previousWeek = weekIndex > 0 ? weeks[weekIndex - 1] : undefined;
  const hasCachedSuggestions = suggestions.length > 0;

  const loadWeeks = useCallback(async () => {
    if (!window.jcs?.loadMeetingWeeks) {
      setStatusMessage('Abra o app pelo Electron para usar esta ferramenta.');
      setLoadingWeeks(false);
      return;
    }
    setLoadingWeeks(true);
    try {
      const result = await window.jcs.loadMeetingWeeks();
      const items = result.weeks ?? [];
      setWeeks(items);
      setWeekIndex(findWeekIndex(items));
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao carregar semanas.');
    } finally {
      setLoadingWeeks(false);
    }
  }, []);

  const refreshPreview = useCallback(async () => {
    if (!week || !window.jcs?.previewFieldServiceContext) return;
    const result = await window.jcs.previewFieldServiceContext({ week, previousWeek });
    if (result.ok && result.preview) setPreview(result.preview);
  }, [week, previousWeek]);

  const loadDraft = useCallback(async () => {
    if (!week || !window.jcs?.getFieldServiceNote) return;
    const result = await window.jcs.getFieldServiceNote(week.id);
    if (result.ok) setDraft(result.value ?? '');
  }, [week]);

  const loadSuggestions = useCallback(async () => {
    if (!week || !window.jcs?.getFieldServiceSuggestions) return;
    const result = await window.jcs.getFieldServiceSuggestions(week.id);
    if (result.ok && result.bundle?.suggestions?.length) {
      setSuggestions(result.bundle.suggestions);
      setGeneratedAt(result.bundle.generatedAt);
      setSelectedId((current) => current ?? result.bundle?.suggestions[0]?.id ?? null);
    } else {
      setSuggestions([]);
      setGeneratedAt(null);
      setSelectedId(null);
    }
  }, [week]);

  const openReference = useCallback(
    async (href: string, linkLabel: string, sourcePub = 'mwb', sourceIssue = '') => {
      if (!window.jcs?.resolveLink) return;
      setPanelOpen(true);
      setPanelTab('references');
      setReferenceLoading(true);
      setReference(null);
      const result = await window.jcs.resolveLink({
        href,
        linkLabel,
        sourcePub,
        sourceIssue: sourceIssue || week?.mwbIssue || '',
        bibleEdition: readBibleEdition(),
      });
      setReference(result);
      setReferenceLoading(false);
    },
    [week?.mwbIssue],
  );

  const openLink = useCallback(
    (link: FieldServiceReferenceLink) => {
      void openReference(link.href, link.label, link.sourcePub ?? 'mwb', link.sourceIssue ?? '');
    },
    [openReference],
  );

  useEffect(() => {
    void loadWeeks();
  }, [loadWeeks]);

  useEffect(() => {
    if (!week) return;
    setStatusMessage(null);
    void refreshPreview();
    void loadDraft();
    void loadSuggestions();
  }, [week, loadDraft, loadSuggestions, refreshPreview]);

  const handleGenerate = async (forceRegenerate = false) => {
    if (!week || !window.jcs?.generateFieldServiceConsiderations) return;
    setGenerating(true);
    setStatusMessage(null);
    try {
      const result = await window.jcs.generateFieldServiceConsiderations({
        week,
        previousWeek,
        forceRegenerate,
      });
      if (result.contextPreview) setPreview(result.contextPreview);
      if (!result.ok || !result.suggestions?.length) {
        setStatusMessage(result.error ?? 'Não foi possível gerar sugestões.');
        return;
      }
      setSuggestions(result.suggestions);
      setGeneratedAt(result.generatedAt ?? new Date().toISOString());
      setSelectedId(result.suggestions[0]?.id ?? null);
      if (result.fromCache) {
        setStatusMessage('Sugestões da semana restauradas.');
      } else if (forceRegenerate) {
        setStatusMessage('Novas sugestões geradas.');
      } else {
        setStatusMessage('Sugestões geradas e salvas para esta semana.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!week || !window.jcs?.setFieldServiceNote) return;
    setSaving(true);
    try {
      await window.jcs.setFieldServiceNote({ weekId: week.id, value: draft });
      setStatusMessage('Rascunho salvo.');
    } finally {
      setSaving(false);
    }
  };

  const handleUseSuggestion = (item: FieldServiceConsiderationSuggestion) => {
    setSelectedId(item.id);
    const parts = [
      item.title,
      item.scripture ? `\n${item.scripture}` : '',
      `\n\n${item.body}`,
      item.encouragement ? `\n\n${item.encouragement}` : '',
    ].filter(Boolean);
    setDraft(parts.join(''));
  };

  const contextChips = useMemo(() => {
    if (!preview) return [];
    return [
      { label: 'lmd', ok: preview.lmd },
      { label: 'Apostila desta semana', ok: preview.currentMwb },
      { label: 'Apostila anterior', ok: preview.previousMwb },
      { label: 'Sentinela desta semana', ok: preview.watchtower },
      { label: 'Sentinela (cache)', ok: preview.watchtowerArchive },
      { label: 'jw.org', ok: preview.jwOrg },
      { label: 'Leitura bíblica', ok: preview.bibleReading },
    ];
  }, [preview]);

  const generatedLabel = formatGeneratedAt(generatedAt ?? undefined);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
          >
            <IconChevronLeft className="h-4 w-4" />
            Elder
          </button>

          <header className="border-b border-jw-border pb-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-jw-purple-light text-jw-purple">
                <IconPreaching className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-semibold text-jw-text">Saída de campo</h2>
                <p className="mt-1 text-sm text-jw-muted">
                  Sugestões elaboradas para considerações que incentivam e animam os irmãos na pregação.
                </p>
              </div>
            </div>
          </header>

          {loadingWeeks ? (
            <p className="text-sm text-jw-muted">Carregando semanas…</p>
          ) : !week ? (
            <p className="text-sm text-jw-muted">Nenhuma semana disponível. Baixe a apostila em Reuniões.</p>
          ) : (
            <>
              <section className="rounded-xl border border-jw-border bg-jw-surface p-4 shadow-sm">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-jw-muted">
                  Semana
                </label>
                <select
                  value={weekIndex}
                  onChange={(event) => setWeekIndex(Number(event.target.value))}
                  className="w-full rounded-lg border border-jw-border bg-white px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple"
                >
                  {weeks.map((item, index) => (
                    <option key={item.id} value={index}>
                      {item.label}
                      {item.isCurrentWeek ? ' · atual' : ''}
                    </option>
                  ))}
                </select>

                {week.bibleReading ? (
                  <p className="mt-2 text-sm text-jw-muted">Leitura bíblica: {week.bibleReading}</p>
                ) : null}

                {preview ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-jw-muted">Fontes</p>
                    <div className="flex flex-wrap gap-2">
                      {contextChips.map((chip) => (
                        <span
                          key={chip.label}
                          className={[
                            'rounded-full px-2.5 py-1 text-xs font-medium',
                            chip.ok
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                              : 'bg-jw-bg text-jw-muted ring-1 ring-jw-border',
                          ].join(' ')}
                        >
                          {chip.label}
                          {chip.ok ? ' ✓' : ''}
                        </span>
                      ))}
                    </div>
                    {preview.missing.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-jw-muted">
                        {preview.missing.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void handleGenerate(hasCachedSuggestions)}
                    className="rounded-lg bg-jw-purple px-4 py-2.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
                  >
                    {generating
                      ? 'Gerando sugestões…'
                      : hasCachedSuggestions
                        ? 'Gerar novamente'
                        : 'Gerar considerações'}
                  </button>
                  {generatedLabel ? (
                    <p className="text-xs text-jw-muted">Salvas em {generatedLabel}</p>
                  ) : null}
                </div>
              </section>

              {statusMessage ? (
                <p className="rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
                  {statusMessage}
                </p>
              ) : null}

              {suggestions.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-jw-text">Sugestões</h3>
                  {suggestions.map((item) => (
                    <article
                      key={item.id}
                      className={[
                        'rounded-xl border bg-jw-surface p-4 shadow-sm transition',
                        selectedId === item.id ? 'border-jw-purple ring-1 ring-jw-purple/30' : 'border-jw-border',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="text-base font-semibold text-jw-text">{item.title}</h4>
                          {item.scripture ? (
                            (() => {
                              const scriptureLink = item.links?.find((link) =>
                                link.href.startsWith('jwpub://b/'),
                              );
                              return scriptureLink ? (
                                <button
                                  type="button"
                                  onClick={() => openLink(scriptureLink)}
                                  className="mt-0.5 text-sm font-medium text-jw-purple hover:underline"
                                >
                                  {item.scripture}
                                </button>
                              ) : (
                                <p className="mt-0.5 text-sm font-medium text-jw-purple">{item.scripture}</p>
                              );
                            })()
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUseSuggestion(item)}
                          className="shrink-0 rounded-lg border border-jw-purple px-3 py-1.5 text-xs font-medium text-jw-purple hover:bg-jw-purple-light"
                        >
                          Usar no rascunho
                        </button>
                      </div>
                      <SuggestionBody
                        body={item.body}
                        onBibleLinkClick={(href, label) => void openReference(href, label)}
                      />
                      {item.encouragement ? (
                        <p className="mt-3 rounded-lg bg-jw-purple-light/50 px-3 py-2 text-sm text-jw-text">
                          {item.encouragement}
                        </p>
                      ) : null}
                      {item.sources.length ? (
                        <p className="mt-3 text-xs text-jw-muted">Fontes: {item.sources.join(' · ')}</p>
                      ) : null}
                      <ReferenceLinkList
                        links={(item.links ?? []).filter((link) => !link.href.startsWith('jwpub://b/'))}
                        onOpen={openLink}
                      />
                    </article>
                  ))}
                </section>
              ) : null}

              <section className="rounded-xl border border-jw-border bg-jw-surface p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-jw-text">Seu rascunho</h3>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveDraft()}
                    className="rounded-lg bg-jw-purple px-3 py-1.5 text-xs font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
                  >
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={12}
                  placeholder="Edite aqui a consideração que você usará na reunião de saída de campo…"
                  className="w-full resize-y rounded-lg border border-jw-border bg-white px-3 py-2 text-sm leading-relaxed text-jw-text outline-none focus:border-jw-purple"
                />
              </section>
            </>
          )}
        </div>
      </div>

      <SidePanel
        open={panelOpen}
        tab={panelTab}
        onTabChange={setPanelTab}
        onClose={() => setPanelOpen(false)}
        referenceLoading={referenceLoading}
        reference={reference}
        downloading={false}
        onLinkClick={(href, label) => void openReference(href, label)}
        onDownloadPublication={() => undefined}
        hideAssistant
        assistantContext={{
          weekLabel: week?.label,
          publicationTitle: 'Saída de campo',
          referenceTitle: reference?.ok ? reference.title : undefined,
          referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
        }}
      />
    </div>
  );
}
