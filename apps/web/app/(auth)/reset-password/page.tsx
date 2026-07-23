"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FiCheck, FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import { resetPassword as resetPasswordRequest } from "@/lib/auth-api";

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

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

    if (!token || !passwordIsValid || !passwordsMatch) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const response = await resetPasswordRequest({ token, password });
      setSuccessMessage(response.message);
      setPassword("");
      setPasswordConfirmation("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Passwort konnte nicht zur\u00fcckgesetzt werden.",
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
                Neues Passwort
              </p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#171717]">
                {"Passwort zur\u00fccksetzen"}
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

              {successMessage && (
                <div className="rounded-[0.3rem] border border-[#d5e7d7] bg-[#f5fbf6] px-4 py-3 text-sm text-[#215732]">
                  {successMessage}
                </div>
              )}

              <div className="relative">
                <label
                  htmlFor="token"
                  className="absolute -top-2.5 left-4 z-10 bg-white px-1.5 text-xs font-medium text-[#6b6b6b]"
                >
                  Reset-Token
                </label>
                <input
                  id="token"
                  name="token"
                  type="text"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
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
                    Neues Passwort
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
                  {[
                    { fulfilled: requirements.minLength, label: "8 Zeichen" },
                    { fulfilled: requirements.uppercase, label: "Gro\u00dfbuchstabe" },
                    { fulfilled: requirements.number, label: "Zahl" },
                    {
                      fulfilled: requirements.specialCharacter,
                      label: "Sonderzeichen",
                    },
                  ].map((item) => (
                    <li
                      key={item.label}
                      className={
                        item.fulfilled
                          ? "flex items-center gap-1.5 text-[#24824b]"
                          : "flex items-center gap-1.5 text-[#9a9a9a]"
                      }
                    >
                      <span
                        className={
                          item.fulfilled
                            ? "grid h-4 w-4 place-items-center rounded-full bg-[#24824b] text-[0.65rem] text-white"
                            : "grid h-4 w-4 place-items-center rounded-full border border-[#d5d5d5] text-transparent"
                        }
                      >
                        <FiCheck />
                      </span>
                      {item.label}
                    </li>
                  ))}
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
                disabled={!token || !passwordIsValid || !passwordsMatch || isLoading}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.3rem] bg-[#171717] px-6 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition hover:bg-[#d69a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d69a35] disabled:cursor-not-allowed disabled:bg-[#b8b8b8] disabled:shadow-none"
              >
                <FiLock className="text-base" />
                {isLoading
                  ? "Passwort wird gesetzt..."
                  : "Passwort zur\u00fccksetzen"}
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
