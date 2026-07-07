import { JwBrowserPanel } from '@/components/JwBrowserPanel';

type JwBrowserPageProps = {
  launchUrl?: string;
};

export function JwBrowserPage({ launchUrl }: JwBrowserPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col px-2 py-2 sm:px-4">
      <JwBrowserPanel mode="public" initialUrl={launchUrl} />
    </div>
  );
}
