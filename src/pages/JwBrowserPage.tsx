import { JwBrowserPanel } from '@/components/JwBrowserPanel';

export function JwBrowserPage() {
  return (
    <div className="flex h-full min-h-0 flex-col px-2 py-2 sm:px-4">
      <JwBrowserPanel mode="public" />
    </div>
  );
}
