"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import type { CurrentUser, OrganizationRole } from "@/lib/user-profile";

// One request per page load; logging out reloads the page and clears this.
let pending: Promise<CurrentUser> | null = null;

function loadCurrentUser() {
  pending ??= apiFetch<CurrentUser>("/users/me").catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

export function isAdminRole(role: OrganizationRole | undefined) {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Role-based UI hints only. Hiding a control never replaces the server-side
 * check; the API answers 403 for everything the role may not do.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadCurrentUser()
      .then((loaded) => active && setUser(loaded))
      .catch(() => undefined)
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return {
    user,
    isLoading,
    isAdmin: isAdminRole(user?.organizationRole),
  };
}
