import type { ReactNode } from 'react';
import { IconCloudDownload, IconHistory, IconMore, IconSearch } from '@/components/Icons';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  variant?: 'purple' | 'light';
  onSearchClick?: () => void;
  children?: ReactNode;
};

export function SectionHeader({
  title,
  subtitle = 'Português (Brasil)',
  variant = 'purple',
  onSearchClick,
  children,
}: SectionHeaderProps) {
  if (variant === 'light') {
    return (
      <header className="shrink-0 border-b border-jw-border bg-white">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <h1 className="truncate text-[17px] font-semibold text-jw-text">{title}</h1>
          <div className="flex shrink-0 items-center gap-0.5 text-jw-muted">
            {onSearchClick ? (
              <HeaderIconButton label="Buscar" onClick={onSearchClick} tone="light">
                <IconSearch className="h-[18px] w-[18px]" />
              </HeaderIconButton>
            ) : null}
            {children}
          </div>
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
          <HeaderIconButton label="Buscar" onClick={onSearchClick}>
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

function HeaderIconButton({
  label,
  children,
  onClick,
  tone = 'purple',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  tone?: 'purple' | 'light';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
      className={
        tone === 'light'
          ? 'rounded p-2 text-jw-muted transition hover:bg-jw-bg hover:text-jw-text disabled:opacity-40'
          : 'rounded p-2 text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-40'
      }
    >
      {children}
    </button>
  );
}
