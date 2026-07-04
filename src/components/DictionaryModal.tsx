import { useEffect, useState } from 'react';
import type { DictionaryLookupResult, DictionarySense } from '../../electron/types';

type DictionaryModalProps = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
};

export function DictionaryModal({ open, initialQuery = '', onClose }: DictionaryModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DictionaryLookupResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setResult(null);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResult(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      if (!window.jcs?.lookupDictionary) return;
      setLoading(true);
      try {
        const lookup = await window.jcs.lookupDictionary({ query: trimmed });
        setResult(lookup);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[72] flex items-start justify-center bg-black/45 px-4 pt-[8vh]">
      <div
        role="dialog"
        aria-label="Dicionário"
        className="flex max-h-[min(78vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-jw-border px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite uma palavra…"
            className="min-w-0 flex-1 rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple"
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-jw-muted hover:bg-jw-bg hover:text-jw-text"
          >
            Esc
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? <p className="text-sm text-jw-muted">Consultando…</p> : null}
          {!loading && query.trim().length < 2 ? (
            <p className="text-sm text-jw-muted">Digite ao menos 2 caracteres.</p>
          ) : null}
          {!loading && result?.error ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {result.error}
            </p>
          ) : null}
          {!loading && result?.ok && result.senses?.length === 0 && !result.error ? (
            <p className="text-sm text-jw-muted">Nenhum verbete encontrado para “{result.query ?? query}”.</p>
          ) : null}

          <div className="space-y-5">
            {result?.senses?.map((sense) => (
              <DictionarySenseBlock key={`${sense.word}-${sense.pos}`} sense={sense} />
            ))}
          </div>
        </div>

        <p className="border-t border-jw-border px-4 py-2 text-[11px] leading-relaxed text-jw-muted">
          Wiktionário (pt) via Kaikki.org — CC BY-SA 3.0. Qualidade inferior a dicionários comerciais (ex.: Aurélio).
        </p>
      </div>
    </div>
  );
}

function DictionarySenseBlock({ sense }: { sense: DictionarySense }) {
  return (
    <article>
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-lg font-semibold text-jw-text">{sense.word}</h3>
        <span className="rounded-full bg-jw-purple-light px-2 py-0.5 text-[11px] font-medium text-jw-purple">
          {sense.posLabel}
        </span>
      </header>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-jw-text">
        {sense.definitions.map((definition) => (
          <li key={definition}>{definition}</li>
        ))}
      </ol>
      {sense.examples.length > 0 ? (
        <ul className="mt-3 space-y-1 border-l-2 border-jw-border pl-3 text-sm italic text-jw-muted">
          {sense.examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
