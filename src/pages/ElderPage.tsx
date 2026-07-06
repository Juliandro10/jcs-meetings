import { IconChevronRight, IconDiamond, IconGuidelineList, IconMeetings, IconOutlinePodium, IconPreaching } from '@/components/Icons';

type ElderPageProps = {
  onOpenOutlines: () => void;
  onOpenGuidelines: () => void;
  onOpenFieldService: () => void;
  onOpenMeetings: () => void;
  onOpenCircuitVisits: () => void;
  onLockElder?: () => void;
};

export function ElderPage({
  onOpenOutlines,
  onOpenGuidelines,
  onOpenFieldService,
  onOpenMeetings,
  onOpenCircuitVisits,
  onLockElder,
}: ElderPageProps) {
  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-jw-muted">
            Ferramentas para anciãos e servos ministeriais. Conteúdo confidencial — use apenas com permissão
            Elder.
          </p>
          {onLockElder ? (
            <button
              type="button"
              onClick={onLockElder}
              className="shrink-0 rounded-lg border border-jw-border px-3 py-1.5 text-xs font-semibold text-jw-muted transition hover:border-jw-purple hover:text-jw-purple"
            >
              Bloquear
            </button>
          ) : null}
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-jw-muted">ATALHOS</h2>
          <div className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm divide-y divide-jw-border">
            <ElderShortcutCard
              title="Esboços"
              description="Discursos públicos, celebração e assembleia de circuito"
              icon={<IconOutlinePodium className="h-6 w-6" />}
              onClick={onOpenOutlines}
            />
            <ElderShortcutCard
              title="Orientações"
              description="Instruções para congregação, reuniões, pregação e assembleias"
              icon={<IconGuidelineList className="h-6 w-6" />}
              onClick={onOpenGuidelines}
            />
            <ElderShortcutCard
              title="Saída de campo"
              description="Considerações para animar e ajudar os irmãos na pregação"
              icon={<IconPreaching className="h-6 w-6" />}
              onClick={onOpenFieldService}
            />
            <ElderShortcutCard
              title="Reuniões de anciãos"
              description="Pauta, deliberações ao vivo e exportação de ATA"
              icon={<IconMeetings className="h-6 w-6" />}
              onClick={onOpenMeetings}
            />
            <ElderShortcutCard
              title="Visita do superintendente"
              description="Hourglass → correção, S-21 por grupo, S-88 e resumo para pendrive"
              icon={<IconDiamond className="h-6 w-6" />}
              onClick={onOpenCircuitVisits}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ElderShortcutCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-jw-bg/80"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-jw-purple-light text-jw-purple">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-jw-text">{title}</span>
        <span className="mt-0.5 block text-sm text-jw-muted">{description}</span>
      </span>
      <IconChevronRight className="h-5 w-5 shrink-0 text-jw-muted transition group-hover:text-jw-purple" />
    </button>
  );
}
