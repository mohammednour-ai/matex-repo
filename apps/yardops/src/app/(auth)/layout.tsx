export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center industrial-bg px-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" aria-hidden>
        <div className="metal-texture absolute inset-0" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
