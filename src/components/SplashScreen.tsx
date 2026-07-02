import { useEffect, useState } from 'react';

type SplashScreenProps = {
  onDone: () => void;
};

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-jw-bg">
      <div className="relative flex h-28 w-28 flex-col items-center justify-center bg-jw-purple text-white shadow-md">
        <span className="text-3xl font-bold tracking-tight">JCS</span>
        <span className="mt-1 text-[11px] font-semibold tracking-[0.2em]">MEETINGS</span>
      </div>

      <div className="mt-8 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-jw-purple"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
