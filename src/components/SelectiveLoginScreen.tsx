import { useEffect, useState } from 'react';
import { IconElder, IconMeetings } from '@/components/Icons';
import { ElderPinGate } from '@/components/ElderPinGate';

type SelectiveLoginScreenProps = {
  onChoose: (mode: 'common' | 'elder') => void;
};

export function SelectiveLoginScreen({ onChoose }: SelectiveLoginScreenProps) {
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [pinFlowOpen, setPinFlowOpen] = useState(false);

  useEffect(() => {
    async function loadStatus() {
      await window.jcs?.lockElderSession?.();
      if (!window.jcs?.getElderAuthStatus) {
        setPinConfigured(false);
        return;
      }
      const status = await window.jcs.getElderAuthStatus();
      setPinConfigured(status.pinConfigured);
    }
    void loadStatus();
  }, []);

  if (pinFlowOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-jw-bg px-6">
        <ElderPinGate
          onBack={() => setPinFlowOpen(false)}
          onSuccess={() => onChoose('elder')}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-jw-bg px-6">
      <div className="mb-10 flex h-24 w-24 flex-col items-center justify-center bg-jw-purple text-white shadow-md">
        <span className="text-2xl font-bold tracking-tight">JCS</span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-[0.2em]">MEETINGS</span>
      </div>

      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold text-jw-purple-dark">Quem vai usar o app agora?</h1>
        <p className="mt-2 text-sm text-jw-muted">
          Escolha o modo de acesso. Orientações de ancião ficam protegidas por PIN.
        </p>
      </div>

      <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <LoginModeCard
          title="Preparação de reuniões"
          description="Apostila, Sentinela, Bíblia, estudo pessoal — ideal para assistência e preparo da semana."
          icon={<IconMeetings className="h-7 w-7" strokeWidth={1.6} />}
          onClick={() => onChoose('common')}
        />
        <LoginModeCard
          title="Área Elder"
          description={
            pinConfigured === false
              ? 'PIN Elder não encontrado neste computador. Use o instalador oficial.'
              : 'Orientações confidenciais, esboços de discurso e ferramentas para anciãos.'
          }
          icon={<IconElder className="h-7 w-7" strokeWidth={1.6} />}
          accent
          onClick={() => setPinFlowOpen(true)}
          disabled={pinConfigured !== true}
        />
      </div>
    </div>
  );
}

function LoginModeCard({
  title,
  description,
  icon,
  onClick,
  accent,
  disabled,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'group rounded-2xl border px-6 py-6 text-left shadow-sm transition',
        accent
          ? 'border-jw-purple/30 bg-white hover:border-jw-purple hover:shadow-md'
          : 'border-jw-border bg-white hover:border-jw-purple/50 hover:shadow-md',
        disabled ? 'cursor-not-allowed opacity-60 hover:border-jw-purple/30 hover:shadow-sm' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-14 w-14 items-center justify-center rounded-xl',
          accent ? 'bg-jw-purple text-white' : 'bg-jw-purple-light text-jw-purple',
        ].join(' ')}
      >
        {icon}
      </span>
      <span className="mt-4 block text-lg font-semibold text-jw-text">{title}</span>
      <span className="mt-2 block text-sm leading-relaxed text-jw-muted">{description}</span>
    </button>
  );
}
