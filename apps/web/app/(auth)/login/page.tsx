import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-start overflow-hidden md:flex-row">
      <div className="relative min-h-[320px] w-full md:min-h-screen md:w-1/2">
        <Image
          src="/images/background.jpg"
          alt="Login Cover"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/55" />

        <div className="absolute inset-0 z-10 flex items-center justify-start px-8 py-10 sm:px-12 lg:px-16 xl:px-20">
          <div className="flex w-full max-w-[440px] flex-col text-left">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.24em] text-[#e4ac3a] sm:text-[0.82rem]">
              Bissinger OS
            </p>
            <div className="mt-5 flex flex-col gap-1">
              <h1 className="whitespace-nowrap text-[3.35rem] font-semibold leading-[1.01] tracking-[-0.05em] text-white sm:text-[4.1rem]">
                Orientierung sichtbar.
              </h1>
              <h1 className="whitespace-nowrap text-[3.35rem] font-semibold leading-[1.01] tracking-[-0.05em] text-white sm:text-[4.1rem]">
                Raumwirkung ruhig.
              </h1>
            </div>
            <p className="mt-6 max-w-[370px] text-[0.98rem] font-normal leading-8 text-white/70 sm:text-[1rem]">
              Die zentrale Plattform für Kunden, Projekte, Angebote,
              Kommunikation und Aufgaben.
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen w-full items-center justify-center border-l border-[#e6d9ca] bg-[#f5f5f5] px-6 py-10 shadow-[-1px_0_0_rgba(255,255,255,0.62)] before:absolute before:left-0 before:top-1/2 before:h-[84%] before:w-5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-[linear-gradient(180deg,rgba(247,241,232,0.0)_0%,rgba(247,241,232,0.95)_16%,rgba(247,241,232,0.95)_84%,rgba(247,241,232,0.0)_100%)] sm:px-10 lg:w-1/2 lg:px-20">
        <div className="mx-auto flex w-full max-w-[560px] flex-col justify-center">
          <div className="inline-flex w-fit rounded-sm border border-[#eadfce] bg-[#f6eee5] px-3 py-1.5">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#b96a16]">
              Interner Zugang
            </p>
          </div>

          <div className="mt-8 flex w-full flex-col">
            <h2 className="text-[2.05rem] font-semibold tracking-[-0.04em] text-[#111111]">
              Willkommen zurück
            </h2>
            <p className="mt-3 max-w-[500px] text-[1rem] leading-8 text-[#758096]">
              Melden Sie sich mit Ihrem Microsoft-Konto von Bissinger Lights
              an, um auf Projekte, Kunden und Aufgaben zuzugreifen.
            </p>
          </div>

          <div className="mt-10 flex w-full flex-col">
            <button className="flex h-[62px] w-full cursor-pointer items-center justify-center rounded-xl border border-transparent bg-[#111111] px-6 text-center text-[1.02rem] font-semibold text-white transition-colors duration-150 hover:border-[#111111] hover:bg-white hover:text-[#111111]">
              <Image
                src="/images/microsoft.png"
                alt="Microsoft Icon"
                width={24}
                height={24}
                className="mr-4 h-6 w-6"
              />
              Mit Microsoft anmelden
            </button>
          </div>

          <div className="mt-8 w-full border-t border-[#ebe5dd]" />

          <div className="mt-8 flex w-full items-center justify-center">
            <p className="text-center text-[0.98rem] font-normal text-[#a5acb8]">
              Noch kein Zugang?{' '}
              <Link
                href="/contact-admin"
                className="cursor-pointer font-semibold text-black transition-colors duration-150 hover:text-[#111111]"
              >
                Administrator kontaktieren
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
