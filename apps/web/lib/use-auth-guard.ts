"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCESS_TOKEN_KEY } from "@/lib/session";

export function useAuthGuard() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      router.replace("/login");
      return;
    }

    const timeoutId = window.setTimeout(() => setIsChecking(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return { isChecking };
}
