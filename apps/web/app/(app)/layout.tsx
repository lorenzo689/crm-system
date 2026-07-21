import { AppShell } from "./_components/app-shell";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen overflow-hidden bg-[linear-gradient(180deg,#eef3fb_0%,#e4ebf6_100%)] text-[var(--color-ink)]">
      <AppShell>{children}</AppShell>
    </div>
  );
}
