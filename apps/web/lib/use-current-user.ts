"use client";

import { useSession } from "@/lib/use-auth-guard";
import type { OrganizationRole } from "@/lib/user-profile";

export function isAdminRole(role: OrganizationRole | null | undefined) {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Role-based UI hints only. Hiding a control never replaces the server-side
 * check; the API answers 403 for everything the role may not do.
 *
 * Reads the in-memory session (no module-level cache of its own), so a logout,
 * a user switch or a role change picked up by the next session check is
 * reflected immediately and never leaks from a previous session.
 */
export function useCurrentUser() {
  const state = useSession();
  const session = state.status === "authenticated" ? state.session : null;

  return {
    user: session
      ? {
          ...session.user,
          organizationName: session.organization?.name ?? "",
          organizationRole: session.role,
        }
      : null,
    isLoading: state.status === "unknown",
    isAdmin: isAdminRole(session?.role),
  };
}
