import { evaluateProjectAttention } from './dashboard-rules';

const baseProject = {
  id: 'p1',
  name: 'Testprojekt',
  status: 'ACTIVE' as const,
  endsAt: null,
  memberCount: 1,
  hasOverdueTask: false,
  hasBlockedTask: false,
};

describe('evaluateProjectAttention', () => {
  it('gibt keine Gruende fuer ein unauffaelliges aktives Projekt zurueck', () => {
    const result = evaluateProjectAttention(baseProject);

    expect(result).toEqual([]);
  });

  it('markiert ON_HOLD-Projekte', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      status: 'ON_HOLD',
    });

    expect(result).toContainEqual({ code: 'ON_HOLD', label: 'Pausiert' });
  });

  it('markiert Projekte mit ueberfaelliger Aufgabe', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      hasOverdueTask: true,
    });

    expect(result).toContainEqual({
      code: 'OVERDUE_TASK',
      label: '\u00dcberf\u00e4llige Aufgabe',
    });
  });

  it('markiert Projekte mit blockierter Aufgabe', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      hasBlockedTask: true,
    });

    expect(result).toContainEqual({
      code: 'BLOCKED_TASK',
      label: 'Blockierte Aufgabe',
    });
  });

  it('markiert Projekte ohne Mitglieder', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      memberCount: 0,
    });

    expect(result).toContainEqual({
      code: 'NO_OWNER',
      label: 'Kein Verantwortlicher',
    });
  });

  it('markiert Projekte mit ueberschrittenem Zieldatum', () => {
    const now = new Date('2026-06-15');
    const result = evaluateProjectAttention(
      { ...baseProject, endsAt: new Date('2026-06-01') },
      now,
    );

    expect(result).toContainEqual({
      code: 'TARGET_DATE_EXCEEDED',
      label: 'Zieldatum \u00fcberschritten',
    });
  });

  it('markiert Projekte nicht bei einem Zieldatum in der Zukunft', () => {
    const now = new Date('2026-06-15');
    const result = evaluateProjectAttention(
      { ...baseProject, endsAt: new Date('2026-07-01') },
      now,
    );

    expect(result).not.toContainEqual(
      expect.objectContaining({ code: 'TARGET_DATE_EXCEEDED' }),
    );
  });

  it('gibt mehrere Gruende zurueck, wenn mehrere Regeln zutreffen', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      status: 'ON_HOLD',
      hasOverdueTask: true,
    });

    expect(result).toHaveLength(2);
  });

  it('ignoriert abgeschlossene Projekte trotz anderer Auffaelligkeiten', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      status: 'COMPLETED',
      hasOverdueTask: true,
      memberCount: 0,
    });

    expect(result).toEqual([]);
  });

  it('ignoriert abgebrochene Projekte', () => {
    const result = evaluateProjectAttention({
      ...baseProject,
      status: 'CANCELLED',
      hasBlockedTask: true,
    });

    expect(result).toEqual([]);
  });
});
