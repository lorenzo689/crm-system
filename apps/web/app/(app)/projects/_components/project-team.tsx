"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

export type ProjectMember = {
  userId: string;
  role: string;
  user: { id: string; displayName: string; email: string };
};

type ProjectTeamProps = {
  projectId: string;
  members: ProjectMember[];
  onMembersChange: (members: ProjectMember[]) => void;
};

type OrganizationUser = {
  id: string;
  email: string;
  displayName: string;
};

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CONTRIBUTOR: "Mitwirkender",
  VIEWER: "Betrachter",
};

export function ProjectTeam({
  projectId,
  members,
  onMembersChange,
}: ProjectTeamProps) {
  const [error, setError] = useState<string | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<
    OrganizationUser[]
  >([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("CONTRIBUTOR");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let isActive = true;

    apiFetch<OrganizationUser[]>("/users")
      .then((users) => {
        if (isActive) {
          setOrganizationUsers(users);
        }
      })
      .catch((caughtError: unknown) => {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Fehler beim Laden der Benutzer",
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingUsers(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const memberUserIds = new Set(members.map((member) => member.userId));
  const availableUsers = organizationUsers.filter(
    (user) => !memberUserIds.has(user.id),
  );

  function handleOpenAddForm() {
    setError(null);
    setSelectedUserId(availableUsers[0]?.id ?? "");
    setSelectedRole("CONTRIBUTOR");
    setIsAddFormOpen(true);
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) {
      return;
    }

    setError(null);
    setIsAdding(true);

    try {
      const addedMember = await apiFetch<ProjectMember>(
        `/projects/${projectId}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: selectedUserId,
            role: selectedRole,
          }),
        },
      );
      onMembersChange([...members, addedMember]);
      setSelectedUserId("");
      setIsAddFormOpen(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Hinzufügen des Mitglieds",
      );
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    setError(null);

    try {
      await apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      });
      onMembersChange(members.filter((member) => member.userId !== userId));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Entfernen",
      );
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    setError(null);

    try {
      const updated = await apiFetch<ProjectMember>(
        `/projects/${projectId}/members/${userId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        },
      );
      onMembersChange(
        members.map((member) =>
          member.userId === userId ? updated : member,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Ändern der Rolle",
      );
    }
  }

  return (
    <div className="max-w-2xl">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="rounded-xl border border-zinc-200 bg-white">
        {members.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            Noch keine Teammitglieder.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {member.user.displayName}
                  </p>
                  <p className="text-xs text-zinc-400">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(event) =>
                      handleRoleChange(member.userId, event.target.value)
                    }
                    className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemove(member.userId)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        {isLoadingUsers ? (
          <p className="text-sm text-zinc-500">Benutzer werden geladen...</p>
        ) : availableUsers.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Alle Organisationsmitglieder sind bereits im Projekt.
          </p>
        ) : isAddFormOpen ? (
          <form
            onSubmit={handleAddMember}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-zinc-500">
                Mitglied
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
                  required
                >
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Rolle
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isAdding || !selectedUserId}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAdding ? "Wird hinzugefügt..." : "Hinzufügen"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="px-2 py-2 text-sm text-zinc-500 hover:text-zinc-700"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleOpenAddForm}
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
          >
            + Mitglied hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}
