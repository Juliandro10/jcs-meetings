import type { ReactNode } from 'react';
import type { AppSection } from '@/lib/types';
import { SECTIONS } from '@/lib/types';
import { SectionHeader } from '@/components/SectionHeader';
import { Sidebar } from '@/components/Sidebar';

type AppShellProps = {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function AppShell({ section, onSectionChange, headerExtra, children }: AppShellProps) {
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[4];

  return (
    <div className="flex h-full bg-jw-bg">
      <Sidebar active={section} onChange={onSectionChange} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionHeader title={meta.title}>{headerExtra}</SectionHeader>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
