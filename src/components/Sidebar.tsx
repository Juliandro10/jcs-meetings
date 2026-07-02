import type { ReactNode } from 'react';
import type { AppSection } from '@/lib/types';
import { SECTIONS } from '@/lib/types';
import {
  IconBible,
  IconDiamond,
  IconHome,
  IconLibrary,
  IconMedia,
  IconMeetings,
  IconMenu,
} from '@/components/Icons';

const ICONS: Record<AppSection, typeof IconHome> = {
  home: IconHome,
  bible: IconBible,
  library: IconLibrary,
  media: IconMedia,
  meetings: IconMeetings,
  'personal-study': IconDiamond,
};

type SidebarProps = {
  active: AppSection;
  onChange: (section: AppSection) => void;
};

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-jw-border bg-[#FAFAFA] py-2">
      <button type="button" className="mb-3 rounded p-2 text-jw-muted hover:bg-jw-purple-light hover:text-jw-purple">
        <IconMenu className="h-5 w-5" />
      </button>

      {SECTIONS.map((section) => {
        const Icon = ICONS[section.id];
        const isActive = section.id === active;

        return (
          <SidebarButton
            key={section.id}
            active={isActive}
            disabled={!section.enabled}
            title={section.title}
            onClick={() => section.enabled && onChange(section.id)}
          >
            <Icon className="h-5 w-5" />
          </SidebarButton>
        );
      })}
    </aside>
  );
}

function SidebarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'relative mb-1 flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-jw-purple-light text-jw-purple' : 'text-jw-muted hover:bg-jw-purple-light/60 hover:text-jw-purple',
        disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer',
      ].join(' ')}
    >
      {active ? <span className="absolute left-0 top-2 h-7 w-1 rounded-r bg-jw-purple" /> : null}
      {children}
    </button>
  );
}
