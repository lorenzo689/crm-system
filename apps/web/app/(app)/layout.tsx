export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef3fb_0%,#e4ebf6_100%)] text-[var(--color-ink)]">
      <main className="min-h-screen w-full p-3 md:p-4 lg:p-5">{children}</main>
    </div>
  );
}
