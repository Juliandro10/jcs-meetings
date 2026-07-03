import type { ReactNode } from 'react';
import type { AppSection } from '@/lib/types';
import { SECTIONS } from '@/lib/types';
import { SectionHeader } from '@/components/SectionHeader';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  headerExtra?: ReactNode;
  showElder?: boolean;
  children: ReactNode;
};

export function AppShell({ section, onSectionChange, headerExtra, showElder, children }: AppShellProps) {
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const headerVariant = section === 'home' ? 'light' : 'purple';

  return (
    <div className="flex h-full bg-jw-bg">
      <Sidebar active={section} onChange={onSectionChange} showElder={showElder} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionHeader title={meta.title} variant={headerVariant}>
          {headerExtra}
        </SectionHeader>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
