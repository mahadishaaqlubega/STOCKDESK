export default function PageLoader({ fullPage = false }) {
  if (fullPage) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4" style={{ background: 'var(--bg-app)' }}>
        <div className="w-full max-w-md space-y-3">
          <div className="app-panel-soft h-24 animate-pulse rounded-[1.4rem] border" />
          <div className="app-panel-soft h-24 animate-pulse rounded-[1.4rem] border" />
          <div className="app-panel-soft h-24 animate-pulse rounded-[1.4rem] border" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="app-panel-soft h-28 animate-pulse rounded-[1.4rem] border" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="app-panel-soft h-32 animate-pulse rounded-[1.2rem] border" />
        ))}
      </div>
    </div>
  );
}
