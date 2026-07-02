import type { ReactNode } from 'react';
import { IconCloudDownload, IconHistory, IconMore, IconSearch } from '@/components/Icons';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  variant?: 'purple' | 'light';
  children?: ReactNode;
};

export function SectionHeader({
  title,
  subtitle = 'Português (Brasil)',
  variant = 'purple',
  children,
}: SectionHeaderProps) {
  if (variant === 'light') {
    return (
      <header className="shrink-0 border-b border-jw-border bg-white">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <h1 className="truncate text-[17px] font-semibold text-jw-text">{title}</h1>
          <div className="flex shrink-0 items-center gap-0.5 text-jw-muted">{children}</div>
        </div>
      </header>
    );
  }

  return (
    <header className="shrink-0 bg-jw-purple-dark text-white">
      <div className="flex items-start justify-between gap-4 px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold leading-tight">{title}</h1>
          <p className="mt-0.5 text-[13px] text-white/70">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 text-white/90">
          <HeaderIconButton label="Buscar">
            <IconSearch className="h-[18px] w-[18px]" />
          </HeaderIconButton>
          <HeaderIconButton label="Baixar">
            <IconCloudDownload className="h-[18px] w-[18px]" />
          </HeaderIconButton>
          <HeaderIconButton label="Histórico">
            <IconHistory className="h-[18px] w-[18px]" />
          </HeaderIconButton>
          <HeaderIconButton label="Mais opções">
            <IconMore className="h-[18px] w-[18px]" />
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
      className="rounded p-2 text-white/85 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
