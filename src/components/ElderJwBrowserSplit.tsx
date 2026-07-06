import { JwBrowserPanel } from '@/components/JwBrowserPanel';
import type { JwBrowserJwpubInstalledEvent } from '../../electron/types';
import type { JwElderDocsCatalog } from '@/lib/jw-elder-docs-urls';

type ElderJwBrowserSplitProps = {
  browserOpen: boolean;
  onCloseBrowser: () => void;
  onJwpubInstalled?: (event: JwBrowserJwpubInstalledEvent) => void;
  elderCatalog?: JwElderDocsCatalog;
  children: React.ReactNode;
};

export function ElderJwBrowserSplit({
  browserOpen,
  onCloseBrowser,
  onJwpubInstalled,
  elderCatalog = 'outlines',
  children,
}: ElderJwBrowserSplitProps) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <div
        className={
          browserOpen
            ? 'min-h-0 min-w-0 flex-1 overflow-auto border-r border-jw-border'
            : 'min-h-0 w-full overflow-auto'
        }
      >
        {children}
      </div>
      {browserOpen ? (
        <div className="flex min-h-0 w-1/2 min-w-[360px] max-w-[720px] shrink-0 flex-col bg-jw-bg">
          <JwBrowserPanel
            mode="elder"
            compact
            elderCatalog={elderCatalog}
            onClose={onCloseBrowser}
            onJwpubInstalled={onJwpubInstalled}
          />
        </div>
      ) : null}
    </div>
  );
}
