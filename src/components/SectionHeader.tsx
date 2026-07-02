import type { ReactNode } from 'react';
import { IconHistory, IconMore, IconSearch } from '@/components/Icons';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

export function SectionHeader({ title, subtitle = 'Português (Brasil)', children }: SectionHeaderProps) {
  return (
    <header className="border-b border-jw-border bg-jw-surface px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-normal text-jw-text">{title}</h1>
          <p className="mt-0.5 text-sm text-jw-muted">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1 text-jw-muted">
          <HeaderIconButton label="Buscar">
            <IconSearch className="h-5 w-5" />
          </HeaderIconButton>
          <HeaderIconButton label="Histórico">
            <IconHistory className="h-5 w-5" />
          </HeaderIconButton>
          <HeaderIconButton label="Mais opções">
            <IconMore className="h-5 w-5" />
          </HeaderIconButton>
          {children}
        </div>
      </div>
    </header>
  );
}

function HeaderIconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rounded p-2 hover:bg-jw-bg hover:text-jw-text"
    >
      {children}
    </button>
  );
}
