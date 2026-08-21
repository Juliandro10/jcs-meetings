import { useEffect, useRef, useState } from 'react';
import { useSelectionActions } from '@/context/SelectionActionsContext';
import { extractOutlineApplyHtml, replyToOutlineHtml } from '@/lib/rich-outline-html';
import { isValidDictionaryQuery, isValidSearchQuery } from '../../shared/selection-text';
import type { AiChatContext, AiChatMessage } from '../../electron/types';

type AssistantChatProps = {
  context: AiChatContext;
  onApplyOutline?: (html: string) => void;
};

const MEETING_QUICK_PROMPTS = [
  {
    label: 'Joia espiritual',
    message:
      'Com base somente na matéria aberta e nas referências do contexto, sugira uma joia espiritual (2–4 frases), com vocabulário das publicações das Testemunhas de Jeová.',
  },
  {
    label: 'Comentário extra',
    message:
      'Com base somente no trecho em contexto, sugira um comentário adicional para a reunião Vida e Ministério, alinhado à Apostila e às Escrituras citadas.',
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
] as const;

const OUTLINE_QUICK_PROMPTS = [
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
      'Sugira ilustrações, analogias ou frases de transição úteis para este esboço, alinhadas ao tema e ao vocabulário JW. Foque na parte selecionada se houver seleção.',
  },
  {
    label: 'Revisar para tribuna',
    message:
      'Revise o esboço preparado para proferimento: linguagem oral, clareza, ordem lógica e tempo. Indique trechos confusos ou repetidos e como melhorar.',
  },
  {
    label: 'Aplicar no editor',
    message:
      'Reescreva o esboço preparado com melhorias pontuais para a tribuna (clareza, transições, linguagem oral), sem inventar doutrina e sem omitir pontos obrigatórios do original. Preserve a estrutura. Responda com 1–3 frases do que mudou e, em seguida, o esboço COMPLETO em HTML simples (<p>, <br>, <strong>, <em>, <u>, <mark>) dentro de um bloco ```jcs-outline .',
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
                  'Reescreva o trecho selecionado no esboço preparado (mais claro para a tribuna, sem mudar o sentido). Depois devolva o ESBOÇO COMPLETO já com esse trecho atualizado, em HTML simples, dentro de um bloco ```jcs-outline .',
              },
            ]
          : []),
      ]
    : MEETING_QUICK_PROMPTS;
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const canApplyOutline = outlineMode && Boolean(onApplyOutline);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void window.jcs?.aiKeyStatus?.().then((status) => setKeyConfigured(status.configured));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  function applyReplyToEditor(content: string, index: number, force = false) {
    if (!onApplyOutline) return;
    const html = force ? replyToOutlineHtml(content) : extractOutlineApplyHtml(content) ?? replyToOutlineHtml(content);
    if (!html) {
      setError('Não encontrei um esboço aplicável nesta resposta.');
      return;
    }
    const confirmed = window.confirm(
      'Substituir o esboço preparado no editor por esta versão da IA? Você pode usar Restaurar original depois, se precisar.',
    );
    if (!confirmed) return;
    onApplyOutline(html);
    setAppliedIndex(index);
    setError(null);
  }

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || loading) return;

    if (!window.jcs?.aiChat) {
      setError('Assistente disponível apenas no app Electron.');
      return;
    }

    setError(null);
    setLoading(true);
    setInput('');

    const nextHistory = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextHistory);

    const result = await window.jcs.aiChat({
      message,
      history: messages,
      context,
    });

    setLoading(false);

    if (!result.ok || !result.reply) {
      setError(result.error ?? 'Não foi possível obter resposta.');
      return;
    }

    setMessages([...nextHistory, { role: 'assistant', content: result.reply }]);
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <p className="text-xs text-jw-muted">
        {outlineMode
          ? 'Compara o esboço original com sua versão preparada. Use “Aplicar no editor” quando quiser que a IA reescreva o texto direto no esboço.'
          : 'Respostas baseadas na matéria aberta, referências do painel e publicações baixadas no app — vocabulário das publicações JW (jw.org / JW Library).'}
      </p>

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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            disabled={loading || keyConfigured === false}
            onClick={() => void sendMessage(prompt.message)}
            className="rounded-full border border-jw-border bg-white px-2.5 py-1 text-[11px] text-jw-text hover:border-jw-purple hover:text-jw-purple disabled:opacity-50"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {messages.length === 0 && !loading ? (
          <p className="text-sm text-jw-muted">
            {outlineMode
              ? 'O assistente vê o esboço original e sua versão preparada. Peça uma alteração e toque em “Aplicar no editor” na resposta para colocar o texto no esboço.'
              : 'Selecione um trecho na matéria ou abra uma referência no painel. O assistente usa só o conteúdo JW disponível aqui — não inventa matéria de fora.'}
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
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => applyReplyToEditor(msg.content, index)}
                    className="mt-2 rounded-md border border-jw-purple/40 bg-jw-purple-light px-2.5 py-1 text-[11px] font-medium text-jw-purple hover:bg-jw-purple hover:text-white disabled:opacity-50"
                  >
                    {appliedIndex === index ? 'Aplicado no editor' : 'Aplicar no editor'}
                  </button>
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
          disabled={loading || !input.trim() || keyConfigured === false}
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
