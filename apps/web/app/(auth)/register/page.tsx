import Link from "next/link";

// Self-registration is disabled: accounts are created by an administrator.
export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f4f5] px-6">
      <div className="w-full max-w-[460px] rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-[#171717]">
          Keine Selbstregistrierung
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#666]">
          Zugänge zu Bissinger OS werden ausschließlich von Ihrer
          Administration angelegt. Bitte wenden Sie sich an die
          verantwortliche Person in Ihrem Unternehmen.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[0.3rem] bg-[#171717] px-6 text-sm font-semibold text-white transition hover:bg-[#d69a35]"
        >
          Zur Anmeldung
        </Link>
      </div>
    </main>
  );
}
