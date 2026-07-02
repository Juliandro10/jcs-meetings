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

/** Ordem e itens visíveis como no JW Library (só seções habilitadas). */
const NAV_SECTIONS = SECTIONS.filter((section) => section.enabled);

type SidebarProps = {
  active: AppSection;
  onChange: (section: AppSection) => void;
};

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center border-r border-[#1f1b24] py-2"
      style={{ backgroundColor: '#2E2933' }}
    >
      <button
        type="button"
        className="mb-3 rounded-md p-2 text-[#b8b0c4] hover:bg-white/10 hover:text-white"
        aria-label="Menu"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      {NAV_SECTIONS.map((section) => {
        const Icon = ICONS[section.id];
        const isActive = section.id === active;

        return (
          <SidebarButton
            key={section.id}
            active={isActive}
            title={section.title}
            onClick={() => onChange(section.id)}
          >
            <Icon className="h-5 w-5" strokeWidth={1.7} />
          </SidebarButton>
        );
      })}
    </aside>
  );
}

function SidebarButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={[
        'relative mb-1 flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-[#453A52] text-white shadow-inner'
          : 'text-[#c4bccf] hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
