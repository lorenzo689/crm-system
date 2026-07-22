import { AppShell } from "./_components/app-shell";
import { AuthGuard } from "./_components/auth-guard";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen overflow-hidden bg-[linear-gradient(180deg,#eef3fb_0%,#e4ebf6_100%)] text-[var(--color-ink)]">
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </div>
  );
}
