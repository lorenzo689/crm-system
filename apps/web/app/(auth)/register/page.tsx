"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FiCheck,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiUser,
} from "react-icons/fi";
import { register as registerRequest } from "@/lib/auth-api";
import { storeAccessToken } from "@/lib/session";

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

function PasswordRequirement({
  fulfilled,
  children,
}: {
  fulfilled: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={
        fulfilled
          ? "flex items-center gap-1.5 text-[#24824b]"
          : "flex items-center gap-1.5 text-[#9a9a9a]"
      }
    >
      <span
        className={
          fulfilled
            ? "grid h-4 w-4 place-items-center rounded-full bg-[#24824b] text-[0.65rem] text-white"
            : "grid h-4 w-4 place-items-center rounded-full border border-[#d5d5d5] text-transparent"
        }
      >
        <FiCheck />
      </span>
      {children}
    </li>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requirements = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    specialCharacter: /[^A-Za-z0-9]/.test(password),
  };
  const passwordIsValid = Object.values(requirements).every(Boolean);
  const passwordsMatch =
    passwordConfirmation.length > 0 && password === passwordConfirmation;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordIsValid || !passwordsMatch) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const { accessToken } = await registerRequest({
        email,
        displayName,
        password,
        registrationCode,
      });
      storeAccessToken(accessToken);
      router.push("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Registrierung fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative flex min-h-screen flex-col px-7 py-7 sm:px-12 sm:py-10 lg:px-14 xl:px-20">
        <BrandMark />

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[390px]">
            <div className="mb-8">
              <p className="text-sm font-medium text-[#686868]">
                Erster Zugang
              </p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#171717]">
                Registrieren bei Bissinger OS
              </h1>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
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
                  htmlFor="displayName"
                  className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                >
                  Anzeigename
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Vor- und Nachname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                  className="h-14 w-full rounded-[0.3rem] border border-[#cfcfcf] bg-white px-4 pr-12 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#aaa] focus:border-[#d69a35] focus:ring-1 focus:ring-[#d69a35]"
                />
                <FiUser className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-[#aaa]" />
              </div>

              <div className="relative">
                <label
                  htmlFor="registrationCode"
                  className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                >
                  Registrierungscode
                </label>
                <input
                  id="registrationCode"
                  name="registrationCode"
                  type="password"
                  autoComplete="off"
                  placeholder="Code von deinem Administrator"
                  value={registrationCode}
                  onChange={(event) => setRegistrationCode(event.target.value)}
                  maxLength={200}
                  required
                  className="h-14 w-full rounded-[0.3rem] border border-[#cfcfcf] bg-white px-4 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#aaa] focus:border-[#d69a35] focus:ring-1 focus:ring-[#d69a35]"
                />
              </div>

              <div>
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
                    autoComplete="new-password"
                    placeholder="Passwort erstellen"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
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

                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[0.7rem]">
                  <PasswordRequirement fulfilled={requirements.minLength}>
                    8 Zeichen
                  </PasswordRequirement>
                  <PasswordRequirement fulfilled={requirements.uppercase}>
                    {"Gro\u00dfbuchstabe"}
                  </PasswordRequirement>
                  <PasswordRequirement fulfilled={requirements.number}>
                    Zahl
                  </PasswordRequirement>
                  <PasswordRequirement
                    fulfilled={requirements.specialCharacter}
                  >
                    Sonderzeichen
                  </PasswordRequirement>
                </ul>
              </div>

              <div>
                <div className="relative">
                  <label
                    htmlFor="passwordConfirmation"
                    className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                  >
                    {"Passwort best\u00e4tigen"}
                  </label>
                  <input
                    id="passwordConfirmation"
                    name="passwordConfirmation"
                    type={showPasswordConfirmation ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Passwort wiederholen"
                    value={passwordConfirmation}
                    onChange={(event) =>
                      setPasswordConfirmation(event.target.value)
                    }
                    required
                    className="h-14 w-full rounded-[0.3rem] border border-[#cfcfcf] bg-white px-4 pr-12 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#aaa] focus:border-[#d69a35] focus:ring-1 focus:ring-[#d69a35]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswordConfirmation((visible) => !visible)
                    }
                    aria-label={
                      showPasswordConfirmation
                        ? "Passwortbest\u00e4tigung verbergen"
                        : "Passwortbest\u00e4tigung anzeigen"
                    }
                    className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center text-lg text-[#aaa] transition hover:text-[#222]"
                  >
                    {showPasswordConfirmation ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                {passwordConfirmation.length > 0 && (
                  <p
                    className={`mt-2 text-xs ${
                      passwordsMatch ? "text-[#24824b]" : "text-[#b42318]"
                    }`}
                  >
                    {passwordsMatch
                      ? "Passw\u00f6rter stimmen \u00fcberein"
                      : "Passw\u00f6rter stimmen nicht \u00fcberein"}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!passwordIsValid || !passwordsMatch || isLoading}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.3rem] bg-[#171717] px-6 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-[#d69a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d69a35] disabled:cursor-not-allowed disabled:bg-[#b8b8b8] disabled:shadow-none"
              >
                <FiLock className="text-base" />
                {isLoading ? "Registrierung l\u00e4uft ..." : "Registrieren"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-sm text-[#777]">
          Bereits ein Konto?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#171717] transition hover:text-[#d69a35]"
          >
            Anmelden
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
