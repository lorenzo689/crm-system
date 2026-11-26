import "./_components/crm.css";
import "./_components/presentation.css";
import { AppShell } from "./_components/app-shell";
import { AuthGuard } from "./_components/auth-guard";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-ink)]">
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </div>
  );
}
