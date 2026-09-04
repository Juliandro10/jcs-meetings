import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectionActions } from '@/context/SelectionActionsContext';
import { extractOutlineApplyHtml, replyToOutlineHtml } from '@/lib/rich-outline-html';
import { releaseEditorSelection } from '@/lib/rich-text-commands';
import {
  AI_CHAT_MAX_SESSIONS,
  buildAiChatSessionKey,
  buildAiChatSessionTitle,
  historyForAiModel,
} from '../../shared/ai-chat-session';
import { isValidDictionaryQuery, isValidSearchQuery } from '../../shared/selection-text';
import type { AiChatContext, AiChatMessage, AiChatSession } from '../../electron/types';

type AssistantChatProps = {
  context: AiChatContext;
  onApplyOutline?: (html: string) => void;
};

const MEETING_QUICK_PROMPTS = [
  {
    label: 'Joia espiritual',
    message:
      'Com base somente na matéria aberta e nas referências do contexto, sugira uma joia espiritual (2–4 frases), com vocabulário das publicações das Testemunhas de Jeová. Se citar versículo, use só a Tradução do Novo Mundo da Bíblia Sagrada (texto do app ou JW.ORG) — nunca outras traduções.',
  },
  {
    label: 'Comentário extra',
    message:
      'Com base somente no trecho em contexto, sugira um comentário adicional para a reunião Vida e Ministério, alinhado à Apostila e às Escrituras citadas. Citações bíblicas: somente Tradução do Novo Mundo da Bíblia Sagrada (app ou JW.ORG).',
  },
  {
    label: 'Aplicação prática',
    message:
      'Com base somente no ponto em estudo no contexto, como aplicar na vida diária ou na congregação? Resposta breve, estilo publicações JW.',
  },
  {
    label: 'Ilustração',
    message:
      'Com base somente no contexto fornecido, sugira uma ilustração ou analogia simples, no estilo das publicações das Testemunhas de Jeová.',
  },
  {
    label: 'Pesquisar na WOL',
    message:
      'Pesquise na Biblioteca On-line (jw.org) um trecho que combine com a matéria em estudo. Use somente o que encontrar na WOL; não invente relatos. Cite a publicação de cada trecho.',
  },
] as const;

const OUTLINE_QUICK_PROMPTS = [
  {
    label: 'Montar discurso',
    message:
      'Prepare o discurso para a tribuna com base no esboço original e na Nota para o orador. Siga o S-141: um ponto principal de cada vez; textos com “Leia” devem ser explicados, ilustrados e aplicados. Use as matérias de pesquisa do esboço e, se estiverem no contexto, as lições do Melhore (th) e as páginas do Beneficie-se (be). Recursos visuais: só imagens estáticas que ensinem um ponto, e poucos textos na tela — marque [TELA: …] e [IMAGEM: …] onde couber, com moderação; sem vídeo. Não invente relatos. Sem cumprimento nem saudação. Responda com 1–3 frases do que fez e, em seguida, o esboço COMPLETO em HTML simples (<p>, <br>, <strong>, <em>, <u>, <mark>) dentro de um bloco ```jcs-outline .',
  },
  {
    label: 'Comparar com original',
    message:
      'Compare o esboço preparado com o esboço original fornecidos no contexto. O que foi mantido, omitido, resumido demais ou acrescentado? Use tópicos claros.',
  },
  {
    label: 'Pontos faltando',
    message:
      'Com base no esboço original, quais pontos ou instruções importantes parecem faltar ou ficaram fracos na versão preparada? Seja específico.',
  },
  {
    label: 'Ilustrações e transições',
    message:
      'Sugira ilustrações, analogias ou frases de transição úteis para este esboço, alinhadas ao tema e ao vocabulário JW. Foque na parte selecionada se houver seleção. Se citar versículo, use só a Tradução do Novo Mundo da Bíblia Sagrada (app ou JW.ORG).',
  },
  {
    label: 'Pesquisar na WOL',
    message:
      'Pesquise na Biblioteca On-line (jw.org) uma experiência ou ilustração que combine com o ponto selecionado — ou com o tema do discurso se não houver seleção. Use somente o que encontrar na WOL; não invente relatos. Sugira onde encaixar no esboço e cite a publicação de cada trecho.',
  },
  {
    label: 'Recursos visuais',
    message:
      'Com base no S-141 (§§ 8–9) e neste esboço, sugira recursos visuais para o discurso: só imagens estáticas que ensinem um ponto importante (nunca para enfeitar), e no máximo alguns textos na tela, com moderação. Sem vídeo, salvo instrução da organização. Para cada sugestão, diga em que ponto usar, o que mostrar e o que falar. Se eu pedir para aplicar no editor, marque [TELA: …] e [IMAGEM: …] nos parágrafos certos. Não invente imagens de publicações que não estejam no contexto.',
  },
  {
    label: 'Revisar para tribuna',
    message:
      'Revise o esboço preparado para proferimento: linguagem oral, clareza, ordem lógica e tempo. Indique trechos confusos ou repetidos e como melhorar. Não use cumprimento nem saudação (Bom dia, Boa noite, irmãos e irmãs) — o presidente já cumprimentou a congregação; o discurso começa direto no tema.',
  },
  {
    label: 'Aplicar no editor',
    message:
      'Reescreva o esboço preparado com melhorias pontuais para a tribuna (clareza, transições, linguagem oral), sem inventar doutrina e sem omitir pontos obrigatórios do original. Preserve a estrutura. NÃO comece com cumprimento ou saudação (Bom dia, Boa noite, bem-vindos, irmãos e irmãs) — o presidente já fez isso antes do discurso; entre direto no tema. Se houver saudação no texto atual, remova. Responda com 1–3 frases do que mudou e, em seguida, o esboço COMPLETO em HTML simples (<p>, <br>, <strong>, <em>, <u>, <mark>) dentro de um bloco ```jcs-outline .',
  },
] as const;

function visibleAssistantReply(content: string) {
  const stripped = content.replace(/```(?:jcs-outline|html)\s*[\s\S]*?```/gi, '').trim();
  return stripped || content;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function AssistantChat({ context, onApplyOutline }: AssistantChatProps) {
  const selectionActions = useSelectionActions();
  const outlineMode = context.contentKind === 'elder-outline';
  const quickPrompts = outlineMode
    ? [
        ...OUTLINE_QUICK_PROMPTS,
        ...(context.selectedText && onApplyOutline
          ? [
              {
                label: 'Reescrever seleção',
                message:
                  'Reescreva o trecho selecionado no esboço preparado (mais claro para a tribuna, sem mudar o sentido). Sem cumprimento nem saudação. Depois devolva o ESBOÇO COMPLETO já com esse trecho atualizado, em HTML simples, dentro de um bloco ```jcs-outline .',
              },
            ]
          : []),
      ]
    : MEETING_QUICK_PROMPTS;
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const [pendingApply, setPendingApply] = useState<{ content: string; index: number } | null>(null);
  const [wolNote, setWolNote] = useState<string | null>(null);
  const canApplyOutline = outlineMode && Boolean(onApplyOutline);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionKey = useMemo(
    () => buildAiChatSessionKey(context),
    [context.contentKind, context.publicationTitle, context.sourceDocumentId, context.sourceIssue, context.sourcePub, context.weekLabel],
  );
  const sessionTitle = useMemo(() => buildAiChatSessionTitle(context), [context.publicationTitle, context.weekLabel]);

  useEffect(() => {
    void window.jcs?.aiKeyStatus?.().then((status) => setKeyConfigured(status.configured));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);
    setAppliedIndex(null);
    setPendingApply(null);
    setViewingKey(sessionKey);

    async function loadSessions() {
      if (!window.jcs?.listAiChatSessions) {
        if (!cancelled) {
          setSessions([]);
          setActiveId(null);
          setMessages([]);
          setSessionReady(true);
        }
        return;
      }
      try {
        const listed = await window.jcs.listAiChatSessions();
        if (cancelled) return;
        setSessions(listed);
        const match = listed.find((item) => item.key === sessionKey);
        setActiveId(match?.id ?? null);
        setMessages(match?.messages ?? []);
      } catch {
        if (!cancelled) {
          setSessions([]);
          setActiveId(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    }

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function persistMessages(nextMessages: AiChatMessage[], key: string) {
    if (!window.jcs?.saveAiChatSession) return;
    try {
      const listed = await window.jcs.saveAiChatSession({
        key,
        title: key === sessionKey ? sessionTitle : sessions.find((item) => item.key === key)?.title ?? sessionTitle,
        messages: nextMessages,
      });
      setSessions(listed);
      const match = listed.find((item) => item.key === key);
      setActiveId(match?.id ?? null);
    } catch {
      /* persistência não deve bloquear a conversa */
    }
  }

  async function startNewConversation() {
    if (loading) return;
    const existing = sessions.find((item) => item.key === sessionKey);
    if (existing && window.jcs?.deleteAiChatSession) {
      try {
        const listed = await window.jcs.deleteAiChatSession(existing.id);
        setSessions(listed);
      } catch {
        setSessions((current) => current.filter((item) => item.id !== existing.id));
      }
    }
    setActiveId(null);
    setViewingKey(sessionKey);
    setMessages([]);
    setAppliedIndex(null);
    setPendingApply(null);
    setError(null);
    inputRef.current?.focus();
  }

  function openSavedSession(id: string) {
    if (loading) return;
    const selected = sessions.find((item) => item.id === id);
    if (!selected) return;
    setActiveId(selected.id);
    setViewingKey(selected.key);
    setMessages(selected.messages);
    setAppliedIndex(null);
    setPendingApply(null);
    setError(null);
  }

  function focusChatInput() {
    const focus = () => {
      releaseEditorSelection();
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus();
    };
    focus();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focus);
    });
    window.setTimeout(focus, 50);
  }

  function applyReplyToEditor(content: string, index: number, force = false) {
    if (!onApplyOutline) return;
    const html = force ? replyToOutlineHtml(content) : extractOutlineApplyHtml(content) ?? replyToOutlineHtml(content);
    if (!html) {
      setPendingApply(null);
      setError('Não encontrei um esboço aplicável nesta resposta.');
      return;
    }
    onApplyOutline(html);
    setAppliedIndex(index);
    setPendingApply(null);
    setError(null);
    focusChatInput();
  }

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || loading || !sessionReady) return;

    if (!window.jcs?.aiChat) {
      setError('Assistente disponível apenas no app Electron.');
      return;
    }

    setError(null);
    setPendingApply(null);
    setWolNote(null);
    setLoading(true);
    setInput('');

    const keyToSave = viewingKey || sessionKey;
    const nextHistory = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextHistory);
    void persistMessages(nextHistory, keyToSave);

    try {
      const result = await window.jcs.aiChat({
        message,
        history: historyForAiModel(messages),
        context,
      });

      if (!result.ok || !result.reply) {
        setError(result.error ?? 'Não foi possível obter resposta.');
        return;
      }

      if (result.wolResearch) {
        const { query, triedQueries, hitCount, fetchedCount, unavailable } = result.wolResearch;
        const triedNote =
          triedQueries && triedQueries.length > 1
            ? ` (também: ${triedQueries.filter((item) => item !== query).join(', ')})`
            : '';
        if (unavailable) {
          setWolNote(
            query
              ? `Pesquisa na Biblioteca On-line por “${query}”${triedNote}: nenhum trecho utilizável.`
              : 'Pesquisa na Biblioteca On-line: informe termos de busca (ex.: “sobre integridade”).',
          );
        } else {
          setWolNote(
            `Pesquisa na Biblioteca On-line por “${query}”${triedNote}: ${fetchedCount} artigo(s) de ${hitCount} resultado(s).`,
          );
        }
      }

      const complete = [...nextHistory, { role: 'assistant' as const, content: result.reply }];
      setMessages(complete);
      void persistMessages(complete, keyToSave);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível obter resposta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <p className="text-xs text-jw-muted">
        {outlineMode
          ? 'Compara o esboço original com sua versão preparada, usa as matérias de pesquisa citadas, o S-141 e o Melhore/Beneficie-se se estiverem baixados. Se pedir, pesquisa na Biblioteca On-line (WOL/jw.org) — sem inventar relatos.'
          : 'Respostas baseadas na matéria aberta, referências do painel e publicações baixadas no app. Se pedir, pesquisa na Biblioteca On-line (WOL/jw.org) — sem inventar relatos.'}
      </p>
      <p className="mt-1 text-[11px] text-jw-muted">
        As {AI_CHAT_MAX_SESSIONS} conversas mais recentes ficam salvas neste dispositivo. As mais antigas são apagadas.
      </p>

      {sessions.length > 0 || messages.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="jcs-ai-chat-session">
            Conversas salvas
          </label>
          <select
            id="jcs-ai-chat-session"
            value={activeId ?? 'draft'}
            disabled={loading || !sessionReady}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'draft') return;
              openSavedSession(value);
            }}
            className="min-w-0 flex-1 rounded-lg border border-jw-border bg-white px-2 py-1.5 text-xs text-jw-text focus:border-jw-purple focus:outline-none disabled:opacity-50"
          >
            {activeId == null ? <option value="draft">Conversa atual</option> : null}
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.preview ? ` — ${item.preview}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading || (!messages.length && !sessions.some((item) => item.key === sessionKey))}
            onClick={() => void startNewConversation()}
            className="shrink-0 rounded-lg border border-jw-border bg-white px-2.5 py-1.5 text-[11px] text-jw-text hover:border-jw-purple hover:text-jw-purple disabled:opacity-50"
          >
            Nova conversa
          </button>
        </div>
      ) : null}

      {keyConfigured === false ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Configure <code className="rounded bg-white/80 px-1">OPENAI_API_KEY</code> no arquivo{' '}
          <code className="rounded bg-white/80 px-1">.env</code> e reinicie o app.
        </div>
      ) : null}

      {context.selectedText ? (
        <div className="mt-3 rounded-lg border border-jw-border bg-white px-3 py-2 text-xs text-jw-text">
          <span className="font-medium text-jw-purple">Seleção: </span>
          {context.selectedText.slice(0, 220)}
          {context.selectedText.length > 220 ? '…' : ''}
          {selectionActions ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isValidDictionaryQuery(context.selectedText) ? (
                <button
                  type="button"
                  onClick={() => selectionActions.dictionaryLookup(context.selectedText ?? '')}
                  className="rounded-full border border-jw-border bg-jw-bg px-2.5 py-1 text-[11px] text-jw-text hover:border-jw-purple hover:text-jw-purple"
                >
                  Consultar no dicionário
                </button>
              ) : null}
              {isValidSearchQuery(context.selectedText) ? (
                <button
                  type="button"
                  onClick={() => selectionActions.searchSelection(context.selectedText ?? '')}
                  className="rounded-full border border-jw-border bg-jw-bg px-2.5 py-1 text-[11px] text-jw-text hover:border-jw-purple hover:text-jw-purple"
                >
                  Buscar nas publicações
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {outlineMode && context.preparedOutlineText ? (
        <div className="mt-3 rounded-lg border border-jw-border bg-white px-3 py-2 text-xs text-jw-muted">
          Esboço preparado incluído no contexto ({context.preparedOutlineText.length.toLocaleString('pt-BR')} caracteres)
        </div>
      ) : null}

      {outlineMode && (context.outlineResearchCount || context.speakerGuidelinesAvailable || context.talkPrepSupportAvailable) ? (
        <div className="mt-2 rounded-lg border border-jw-border bg-white px-3 py-2 text-xs text-jw-muted">
          {context.outlineResearchCount
            ? `${context.outlineResearchCount.toLocaleString('pt-BR')} matéria(s) de pesquisa do esboço no contexto. `
            : null}
          {context.speakerGuidelinesAvailable
            ? 'S-141 incluído nas orientações ao assistente. '
            : 'S-141 não encontrado — importe em Elder → Orientações. '}
          {context.talkPrepSupportAvailable
            ? 'Melhore e Beneficie-se incluídos (lições e páginas citadas no S-141).'
            : null}
        </div>
      ) : null}

      {wolNote ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          {wolNote}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            disabled={loading || keyConfigured === false || !sessionReady}
            onClick={() => void sendMessage(prompt.message)}
            className="rounded-full border border-jw-border bg-white px-2.5 py-1 text-[11px] text-jw-text hover:border-jw-purple hover:text-jw-purple disabled:opacity-50"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="jcs-assistant-chat-messages mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-1"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('button, textarea, select, a, input, label')) return;
          releaseEditorSelection();
        }}
      >
        {messages.length === 0 && !loading ? (
          <p className="text-sm text-jw-muted">
            {!sessionReady
              ? 'Carregando conversas salvas…'
              : outlineMode
                ? 'Peça “Montar discurso”, “Pesquisar na WOL” (experiência ou ilustração) ou uma alteração e toque em “Aplicar no editor”.'
                : 'Selecione um trecho na matéria ou peça “Pesquisar na WOL”. O assistente usa só conteúdo JW disponível aqui — não inventa matéria de fora.'}
          </p>
        ) : null}

        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={[
              'rounded-xl px-3 py-2 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'ml-6 bg-jw-purple text-white'
                : 'mr-4 border border-jw-border bg-white text-jw-text',
            ].join(' ')}
          >
            {msg.role === 'assistant' ? (
              <div>
                <div className="whitespace-pre-wrap">{visibleAssistantReply(msg.content)}</div>
                {canApplyOutline && extractOutlineApplyHtml(msg.content) ? (
                  <p className="mt-2 text-[11px] text-jw-muted">Esta resposta inclui uma versão pronta para o editor.</p>
                ) : null}
                {canApplyOutline ? (
                  pendingApply?.index === index ? (
                    <div className="mt-2 rounded-md border border-jw-purple/40 bg-jw-purple-light px-2.5 py-2">
                      <p className="text-[11px] text-jw-text">
                        Substituir o esboço preparado no editor por esta versão? Você pode usar Restaurar original
                        depois, se precisar.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPendingApply(null)}
                          className="rounded-md border border-jw-border bg-white px-2.5 py-1 text-[11px] text-jw-text hover:border-jw-purple"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => applyReplyToEditor(pendingApply.content, pendingApply.index)}
                          className="rounded-md bg-jw-purple px-2.5 py-1 text-[11px] font-medium text-white hover:bg-jw-purple-dark"
                        >
                          Substituir
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setError(null);
                        setPendingApply({ content: msg.content, index });
                      }}
                      className="mt-2 rounded-md border border-jw-purple/40 bg-jw-purple-light px-2.5 py-1 text-[11px] font-medium text-jw-purple hover:bg-jw-purple hover:text-white disabled:opacity-50"
                    >
                      {appliedIndex === index ? 'Aplicado no editor' : 'Aplicar no editor'}
                    </button>
                  )
                ) : null}
              </div>
            ) : (
              msg.content
            )}
          </div>
        ))}

        {loading ? (
          <p className="text-sm text-jw-muted">Assistente pensando…</p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <form
        className="mt-3 shrink-0 border-t border-jw-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onMouseDown={() => releaseEditorSelection()}
          onFocus={() => releaseEditorSelection()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(input);
            }
          }}
          rows={3}
          placeholder="Escreva sua pergunta…"
          disabled={loading || keyConfigured === false}
          className="w-full resize-none rounded-lg border border-jw-border bg-white px-3 py-2 text-sm text-jw-text placeholder:text-jw-muted focus:border-jw-purple focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || keyConfigured === false || !sessionReady}
          className="mt-2 w-full rounded-lg bg-jw-purple px-3 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

export function referencePlainText(html?: string) {
  if (!html) return undefined;
  const text = stripHtml(html);
  return text || undefined;
}
