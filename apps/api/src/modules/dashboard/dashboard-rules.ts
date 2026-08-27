export type ProjectForEvaluation = {
  id: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  endsAt: Date | null;
  memberCount: number;
  hasOverdueTask: boolean;
  hasBlockedTask: boolean;
};

export type AttentionReason = {
  code:
    | 'ON_HOLD'
    | 'OVERDUE_TASK'
    | 'BLOCKED_TASK'
    | 'NO_OWNER'
    | 'TARGET_DATE_EXCEEDED';
  label: string;
};

const REASON_LABELS: Record<AttentionReason['code'], string> = {
  ON_HOLD: 'Pausiert',
  OVERDUE_TASK: '\u00dcberf\u00e4llige Aufgabe',
  BLOCKED_TASK: 'Blockierte Aufgabe',
  NO_OWNER: 'Kein Verantwortlicher',
  TARGET_DATE_EXCEEDED: 'Zieldatum \u00fcberschritten',
};

export function evaluateProjectAttention(
  project: ProjectForEvaluation,
  now: Date = new Date(),
): AttentionReason[] {
  if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
    return [];
  }

  const reasons: AttentionReason[] = [];

  if (project.status === 'ON_HOLD') {
    reasons.push({ code: 'ON_HOLD', label: REASON_LABELS.ON_HOLD });
  }

  if (project.hasOverdueTask) {
    reasons.push({
      code: 'OVERDUE_TASK',
      label: REASON_LABELS.OVERDUE_TASK,
    });
  }

  if (project.hasBlockedTask) {
    reasons.push({
      code: 'BLOCKED_TASK',
      label: REASON_LABELS.BLOCKED_TASK,
    });
  }

  if (project.memberCount === 0) {
    reasons.push({ code: 'NO_OWNER', label: REASON_LABELS.NO_OWNER });
  }

  if (project.endsAt && project.endsAt < now) {
    reasons.push({
      code: 'TARGET_DATE_EXCEEDED',
      label: REASON_LABELS.TARGET_DATE_EXCEEDED,
    });
  }

  return reasons;
}
