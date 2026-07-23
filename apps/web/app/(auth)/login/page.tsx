"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import { login as loginRequest } from "@/lib/auth-api";
import { consumeSessionNotice, storeAccessToken } from "@/lib/session";

function BrandMark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-3"
      aria-label="Bissinger OS Startseite"
    >
      <Image
        src="/images/images.jpg"
        alt="Bissinger Lights Logo"
        width={42}
        height={42}
        className="h-10 w-10 rounded-lg object-cover"
      />
      <span className="text-[1.05rem] font-semibold tracking-[-0.035em] text-[#151515]">
        Bissinger OS
      </span>
    </Link>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSessionNotice(consumeSessionNotice());
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { accessToken } = await loginRequest({ email, password });
      storeAccessToken(accessToken);
      router.push("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
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
          <div className="w-full max-w-[390px]">
            <div className="mb-10">
              <p className="text-sm font-medium text-[#686868]">
                {"Willkommen zur\u00fcck"}
              </p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#171717]">
                Anmelden bei Bissinger OS
              </h1>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {sessionNotice && (
                <div
                  role="status"
                  className="rounded-[0.3rem] border border-[#f0d9a8] bg-[#fff7e8] px-4 py-3 text-sm text-[#805b10]"
                >
                  {sessionNotice}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-[0.3rem] border border-[#f1c7c3] bg-[#fff6f5] px-4 py-3 text-sm text-[#9f2d24]"
                >
                  {error}
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

              <div className="relative">
                <label
                  htmlFor="password"
                  className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                >
                  Passwort
                </label>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Passwort eingeben"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-14 w-full rounded-[0.3rem] border border-[#cfcfcf] bg-white px-4 pr-12 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#aaa] focus:border-[#d69a35] focus:ring-1 focus:ring-[#d69a35]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={
                    showPassword ? "Passwort verbergen" : "Passwort anzeigen"
                  }
                  className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center text-lg text-[#aaa] transition hover:text-[#222]"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-[#171717] transition hover:text-[#d69a35]"
                >
                  Passwort vergessen?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.3rem] bg-[#171717] px-6 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-[#d69a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d69a35] disabled:cursor-wait disabled:bg-[#777]"
              >
                <FiLock className="text-base" />
                {isLoading ? "Anmeldung l\u00e4uft ..." : "Anmelden"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-sm text-[#777]">
          Noch kein Konto?{" "}
          <Link
            href="/register"
            className="font-semibold text-[#171717] transition hover:text-[#d69a35]"
          >
            Registrieren
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
