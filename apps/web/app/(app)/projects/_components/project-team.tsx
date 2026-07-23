"use client";

import { useState } from "react";
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
    </div>
  );
}
