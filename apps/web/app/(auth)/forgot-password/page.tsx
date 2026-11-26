"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FiKey, FiMail } from "react-icons/fi";
import { forgotPassword as forgotPasswordRequest } from "@/lib/auth-api";

function BrandMark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center"
      aria-label="Bissinger OS Startseite"
    >
      <Image
        src="/images/images.jpg"
        alt="Bissinger Lights Logo"
        width={96}
        height={84}
        className="h-[84px] w-24 object-contain"
      />
    </Link>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await forgotPasswordRequest({ email });
      setResult(response);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Reset konnte nicht angefordert werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative flex min-h-screen flex-col px-7 py-7 sm:px-12 sm:py-10 lg:px-14 xl:px-20">
        <BrandMark />

        <div className="flex flex-1 items-center justify-center py-16">
          <div className="w-full max-w-[420px]">
            <div className="mb-10">
              <p className="text-sm font-medium text-[#686868]">
                {"Passwort zur\u00fccksetzen"}
              </p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#171717]">
                Reset-Link anfordern
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#686868]">
                {"Wir senden einen Reset-Link an die hinterlegte E-Mail-Adresse."}
                {" Lokal können Sie die Nachricht zusätzlich in Mailpit unter"}
                {" `http://localhost:8025` pr\u00fcfen."}
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div
                  role="alert"
                  className="rounded-[0.3rem] border border-[#f1c7c3] bg-[#fff6f5] px-4 py-3 text-sm text-[#9f2d24]"
                >
                  {error}
                </div>
              )}

              {result && (
                <div className="space-y-3 rounded-[0.3rem] border border-[#d5e7d7] bg-[#f5fbf6] px-4 py-4 text-sm text-[#215732]">
                  <p>{result.message}</p>
                </div>
              )}

              <div className="relative">
                <label
                  htmlFor="email"
                  className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                >
                  E-Mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@bissinger-lights.de"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-14 w-full rounded-[0.3rem] border border-[#cfcfcf] bg-white px-4 pr-12 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#aaa] focus:border-[#d69a35] focus:ring-1 focus:ring-[#d69a35]"
                />
                <FiMail className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-[#aaa]" />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.3rem] bg-[#171717] px-6 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-[#d69a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d69a35] disabled:cursor-wait disabled:bg-[#777]"
              >
                <FiKey className="text-base" />
                {isLoading
                  ? "Link wird vorbereitet..."
                  : "Reset-Link anfordern"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-sm text-[#777]">
          {"Zur\u00fcck zur"}{" "}
          <Link
            href="/login"
            className="font-semibold text-[#171717] transition hover:text-[#d69a35]"
          >
            Anmeldung
          </Link>
        </p>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden bg-[#111827] lg:block">
        <Image
          src="/images/Buehnenkantenbeleuchtung.jpeg"
          alt={
            "Beleuchtete B\u00fchnenkanten mit blauen und warmwei\u00dfen Lichtlinien"
          }
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/10" />
      </aside>
    </main>
  );
}
