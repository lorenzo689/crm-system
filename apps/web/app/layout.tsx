import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bissinger OS',
  description: 'Interne Plattform für Kunden, Projekte und Aufgaben.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render per request: the CSP nonce from proxy.ts can only be applied to
  // Next's scripts during dynamic rendering, never to prebuilt HTML.
  await connection();
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
