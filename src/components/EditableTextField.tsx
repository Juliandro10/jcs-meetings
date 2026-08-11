import { useEffect, useRef, useState } from 'react';

type EditableTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
};

function useDebouncedCallback<T extends (...args: never[]) => void>(callback: T, delayMs: number) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (value: Parameters<T>[0]) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      callbackRef.current(value as never);
    }, delayMs);
  };
}

/**
 * Campo com rascunho local: o pai só recebe atualizações com debounce e ao sair do campo.
 * Evita perder foco/cursor quando a árvore acima re-renderiza a cada tecla.
 */
export function EditableTextField({
  value,
  onChange,
  multiline = false,
  rows = 3,
  className,
  placeholder,
  type = 'text',
  min,
  max,
}: EditableTextFieldProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const debouncedCommit = useDebouncedCallback(onChange, 350);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  const commit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const handleChange = (next: string) => {
    setDraft(next);
    debouncedCommit(next);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    commit(draft);
  };

  if (multiline) {
    return (
      <textarea
        rows={rows}
        value={draft}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={handleBlur}
        onChange={(event) => handleChange(event.target.value)}
      />
    );
  }

  return (
    <input
      type={type}
      min={min}
      max={max}
      value={draft}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value)}
    />
  );
}

type AssigneesTextFieldProps = {
  assignees: string[];
  onChange: (assignees: string[]) => void;
  className?: string;
  placeholder?: string;
};

export function formatAssigneesText(assignees: string[]) {
  return assignees.join(' / ');
}

export function parseAssigneesText(value: string) {
  return value
    .split(/\s*[,·|]\s*|\s+\/\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Designados como texto livre; só separa nomes ao sair do campo. */
export function AssigneesTextField({
  assignees,
  onChange,
  className,
  placeholder,
}: AssigneesTextFieldProps) {
  const [text, setText] = useState(() => formatAssigneesText(assignees));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatAssigneesText(assignees));
    }
  }, [assignees]);

  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        onChange(parseAssigneesText(text));
      }}
      onChange={(event) => setText(event.target.value)}
    />
  );
}
