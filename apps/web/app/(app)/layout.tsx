export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen overflow-hidden bg-[linear-gradient(180deg,#eef3fb_0%,#e4ebf6_100%)] text-[var(--color-ink)]">
      <main className="h-full w-full overflow-hidden">{children}</main>
    </div>
  );
}
