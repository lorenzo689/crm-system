"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAuthGuard() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.replace("/login");
      return;
    }

    const timeoutId = window.setTimeout(() => setIsChecking(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return { isChecking };
}
