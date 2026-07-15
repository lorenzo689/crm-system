export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-ink)]">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-1 px-6 py-8 sm:px-10 lg:px-14">
        {children}
      </main>
    </div>
  );
}
