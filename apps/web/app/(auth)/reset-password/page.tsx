import { Suspense } from "react";
import { ResetPasswordForm } from "./_components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-zinc-400">Lädt…</p>}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
