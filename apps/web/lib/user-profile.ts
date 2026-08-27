export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  organizationName: string;
  organizationRole: OrganizationRole;
};

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  OWNER: "Inhaber",
  ADMIN: "Administrator",
  MEMBER: "Mitglied",
};

export function getUserInitials(displayName: string) {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) {
    return "?";
  }

  if (nameParts.length === 1) {
    return nameParts[0].slice(0, 2).toLocaleUpperCase("de-DE");
  }

  return `${nameParts[0][0]}${nameParts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase(
    "de-DE",
  );
}
