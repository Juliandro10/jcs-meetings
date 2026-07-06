import type { ReactNode } from 'react';
import type { AppSection } from '@/lib/types';
import { SECTIONS } from '@/lib/types';
import { SectionHeader } from '@/components/SectionHeader';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onSearchClick?: () => void;
  headerExtra?: ReactNode;
  showElder?: boolean;
  /** Conteúdo que preenche a área (ex.: navegador embutido) — sem scroll no main. */
  contentFill?: boolean;
  children: ReactNode;
};

export function AppShell({
  section,
  onSectionChange,
  onSearchClick,
  headerExtra,
  showElder,
  contentFill = false,
  children,
}: AppShellProps) {
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const headerVariant = section === 'home' ? 'light' : 'purple';

  return (
    <div className="flex h-full bg-jw-bg">
      <Sidebar active={section} onChange={onSectionChange} showElder={showElder} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionHeader title={meta.title} variant={headerVariant} onSearchClick={onSearchClick}>
          {headerExtra}
        </SectionHeader>
        <main
          className={
            contentFill
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'min-h-0 flex-1 overflow-auto'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
