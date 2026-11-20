import {
  asUser,
  createOrganization,
  createProject,
  createTestApp,
  createUser,
  resetDatabase,
  type TestApp,
  tokenFor,
} from './helpers/harness';

describe('Authorization and organization isolation (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  /** One organization with an owner, an admin and a member, plus a project. */
  async function setup() {
    const org = await createOrganization(t.prisma);
    const owner = await createUser(t.prisma, org.id, 'OWNER');
    const admin = await createUser(t.prisma, org.id, 'ADMIN');
    const member = await createUser(t.prisma, org.id, 'MEMBER');
    const project = await createProject(t.prisma, org.id);
    return {
      org,
      owner,
      admin,
      member,
      project,
      ownerToken: await tokenFor(t, owner),
      adminToken: await tokenFor(t, admin),
      memberToken: await tokenFor(t, member),
    };
  }

  const api = (path: string) => `/api/v1${path}`;

  describe('regular CRM work stays open to members', () => {
    it('lets a MEMBER create and edit projects, tasks and notes', async () => {
      const s = await setup();
      const customer = await t.prisma.customer.findFirstOrThrow();

      const project = await t
        .http()
        .post(api('/projects'))
        .set(asUser(s.memberToken))
        .send({
          customerId: customer.id,
          name: 'Neues Projekt',
          projectNumber: 'P-NEU-1',
        });
      expect(project.status).toBe(201);

      const task = await t
        .http()
        .post(api('/tasks'))
        .set(asUser(s.memberToken))
        .send({ title: 'Aufgabe', projectId: s.project.id });
      expect(task.status).toBe(201);

      const note = await t
        .http()
        .post(api('/notes'))
        .set(asUser(s.memberToken))
        .send({ content: 'Hallo', projectId: s.project.id });
      expect(note.status).toBe(201);

      const update = await t
        .http()
        .patch(api(`/projects/${s.project.id}`))
        .set(asUser(s.memberToken))
        .send({ name: 'Umbenannt' });
      expect(update.status).toBe(200);
    });

    it('lists organization users for every member', async () => {
      const s = await setup();
      const response = await t
        .http()
        .get(api('/users'))
        .set(asUser(s.memberToken));
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
    });
  });

  describe('administration needs OWNER or ADMIN', () => {
    it('answers 401 without a token', async () => {
      const s = await setup();
      const response = await t
        .http()
        .post(api(`/projects/${s.project.id}/members`))
        .send({ userId: s.member.id, role: 'VIEWER' });
      expect(response.status).toBe(401);
    });

    it('forbids a MEMBER to manage project memberships', async () => {
      const s = await setup();
      const add = await t
        .http()
        .post(api(`/projects/${s.project.id}/members`))
        .set(asUser(s.memberToken))
        .send({ userId: s.member.id, role: 'MANAGER' });
      expect(add.status).toBe(403);

      await t.prisma.projectMember.create({
        data: {
          projectId: s.project.id,
          userId: s.member.id,
          role: 'CONTRIBUTOR',
        },
      });
      const update = await t
        .http()
        .patch(api(`/projects/${s.project.id}/members/${s.member.id}`))
        .set(asUser(s.memberToken))
        .send({ role: 'OWNER' });
      expect(update.status).toBe(403);
      const remove = await t
        .http()
        .delete(api(`/projects/${s.project.id}/members/${s.member.id}`))
        .set(asUser(s.memberToken));
      expect(remove.status).toBe(403);
      expect(await t.prisma.projectMember.count()).toBe(1);
    });

    it('forbids a MEMBER to administer users', async () => {
      const s = await setup();
      for (const [method, path, body] of [
        ['patch', `/users/${s.admin.id}/role`, { role: 'MEMBER' }],
        ['post', `/users/${s.admin.id}/deactivate`, undefined],
        ['post', `/users/${s.admin.id}/revoke-sessions`, undefined],
      ] as const) {
        const response = await t
          .http()
          [method](api(path))
          .set(asUser(s.memberToken))
          .send(body);
        expect(response.status).toBe(403);
      }
      const admin = await t.prisma.user.findUniqueOrThrow({
        where: { id: s.admin.id },
      });
      expect(admin.archivedAt).toBeNull();
      expect(admin.tokenVersion).toBe(0);
    });

    it('lets an ADMIN manage project memberships', async () => {
      const s = await setup();
      const add = await t
        .http()
        .post(api(`/projects/${s.project.id}/members`))
        .set(asUser(s.adminToken))
        .send({ userId: s.member.id, role: 'CONTRIBUTOR' });
      expect(add.status).toBe(201);

      const update = await t
        .http()
        .patch(api(`/projects/${s.project.id}/members/${s.member.id}`))
        .set(asUser(s.adminToken))
        .send({ role: 'VIEWER' });
      expect(update.status).toBe(200);

      const remove = await t
        .http()
        .delete(api(`/projects/${s.project.id}/members/${s.member.id}`))
        .set(asUser(s.adminToken));
      expect(remove.status).toBe(200);
    });

    it('uses the role stored in the database, not what the token once said', async () => {
      const s = await setup();
      await t.prisma.organizationMember.updateMany({
        where: { userId: s.admin.id },
        data: { role: 'MEMBER' },
      });
      const response = await t
        .http()
        .post(api(`/projects/${s.project.id}/members`))
        .set(asUser(s.adminToken))
        .send({ userId: s.member.id, role: 'VIEWER' });
      expect(response.status).toBe(403);
    });
  });

  describe('owner protection', () => {
    it('lets an ADMIN change MEMBER/ADMIN roles but never grant OWNER', async () => {
      const s = await setup();
      const promote = await t
        .http()
        .patch(api(`/users/${s.member.id}/role`))
        .set(asUser(s.adminToken))
        .send({ role: 'ADMIN' });
      expect(promote.status).toBe(200);

      const grantOwner = await t
        .http()
        .patch(api(`/users/${s.member.id}/role`))
        .set(asUser(s.adminToken))
        .send({ role: 'OWNER' });
      expect(grantOwner.status).toBe(403);

      const selfEscalate = await t
        .http()
        .patch(api(`/users/${s.admin.id}/role`))
        .set(asUser(s.adminToken))
        .send({ role: 'OWNER' });
      expect(selfEscalate.status).toBe(403);

      const roles = await t.prisma.organizationMember.findMany({
        where: { role: 'OWNER' },
      });
      expect(roles).toHaveLength(1);
    });

    it('forbids an ADMIN to touch an OWNER', async () => {
      const s = await setup();
      const demote = await t
        .http()
        .patch(api(`/users/${s.owner.id}/role`))
        .set(asUser(s.adminToken))
        .send({ role: 'MEMBER' });
      expect(demote.status).toBe(403);
      const lock = await t
        .http()
        .post(api(`/users/${s.owner.id}/deactivate`))
        .set(asUser(s.adminToken));
      expect(lock.status).toBe(403);
      const revoke = await t
        .http()
        .post(api(`/users/${s.owner.id}/revoke-sessions`))
        .set(asUser(s.adminToken));
      expect(revoke.status).toBe(403);
    });

    it('lets an OWNER appoint another owner', async () => {
      const s = await setup();
      const response = await t
        .http()
        .patch(api(`/users/${s.admin.id}/role`))
        .set(asUser(s.ownerToken))
        .send({ role: 'OWNER' });
      expect(response.status).toBe(200);
    });

    it('never removes, locks or demotes the last active owner', async () => {
      const s = await setup();
      const demote = await t
        .http()
        .patch(api(`/users/${s.owner.id}/role`))
        .set(asUser(s.ownerToken))
        .send({ role: 'ADMIN' });
      expect(demote.status).toBe(409);
      const lock = await t
        .http()
        .post(api(`/users/${s.owner.id}/deactivate`))
        .set(asUser(s.ownerToken));
      expect(lock.status).toBe(409);

      const owner = await t.prisma.user.findUniqueOrThrow({
        where: { id: s.owner.id },
        include: { organizationRoles: true },
      });
      expect(owner.archivedAt).toBeNull();
      expect(owner.organizationRoles[0].role).toBe('OWNER');
    });

    it('does not count an archived owner as a remaining owner', async () => {
      const s = await setup();
      await createUser(t.prisma, s.org.id, 'OWNER', { archived: true });
      const demote = await t
        .http()
        .patch(api(`/users/${s.owner.id}/role`))
        .set(asUser(s.ownerToken))
        .send({ role: 'MEMBER' });
      expect(demote.status).toBe(409);
    });

    it('keeps at least one owner when two owners remove each other in parallel', async () => {
      const s = await setup();
      const second = await createUser(t.prisma, s.org.id, 'OWNER');
      const secondToken = await tokenFor(t, second);

      const [first, other] = await Promise.all([
        t
          .http()
          .post(api(`/users/${second.id}/deactivate`))
          .set(asUser(s.ownerToken)),
        t
          .http()
          .post(api(`/users/${s.owner.id}/deactivate`))
          .set(asUser(secondToken)),
      ]);
      // The request that waited for the lock finds its own actor already locked
      // out by the other one and is rejected as unauthenticated (401). Before
      // the actor was re-validated under the lock it got 409 instead.
      expect([first.status, other.status].sort()).toEqual([200, 401]);

      const activeOwners = await t.prisma.organizationMember.count({
        where: { role: 'OWNER', user: { archivedAt: null } },
      });
      expect(activeOwners).toBe(1);
    });
  });

  describe('project role VIEWER is read-only', () => {
    async function viewerSetup() {
      const s = await setup();
      await t.prisma.projectMember.create({
        data: { projectId: s.project.id, userId: s.member.id, role: 'VIEWER' },
      });
      const task = await t.prisma.task.create({
        data: {
          organizationId: s.org.id,
          projectId: s.project.id,
          createdByUserId: s.owner.id,
          title: 'Bestehend',
        },
      });
      return { ...s, task };
    }

    it('may still read the project', async () => {
      const s = await viewerSetup();
      const response = await t
        .http()
        .get(api(`/projects/${s.project.id}`))
        .set(asUser(s.memberToken));
      expect(response.status).toBe(200);
    });

    it('cannot change or archive the project', async () => {
      const s = await viewerSetup();
      const update = await t
        .http()
        .patch(api(`/projects/${s.project.id}`))
        .set(asUser(s.memberToken))
        .send({ name: 'Hack' });
      expect(update.status).toBe(403);
      const archive = await t
        .http()
        .post(api(`/projects/${s.project.id}/archive`))
        .set(asUser(s.memberToken));
      expect(archive.status).toBe(403);
      const stored = await t.prisma.project.findUniqueOrThrow({
        where: { id: s.project.id },
      });
      expect(stored.name).not.toBe('Hack');
      expect(stored.archivedAt).toBeNull();
    });

    it('cannot create or change tasks of the project', async () => {
      const s = await viewerSetup();
      const create = await t
        .http()
        .post(api('/tasks'))
        .set(asUser(s.memberToken))
        .send({ title: 'Neu', projectId: s.project.id });
      expect(create.status).toBe(403);

      const update = await t
        .http()
        .patch(api(`/tasks/${s.task.id}`))
        .set(asUser(s.memberToken))
        .send({ title: 'Geändert' });
      expect(update.status).toBe(403);
      const complete = await t
        .http()
        .post(api(`/tasks/${s.task.id}/complete`))
        .set(asUser(s.memberToken));
      expect(complete.status).toBe(403);
      const assign = await t
        .http()
        .post(api(`/tasks/${s.task.id}/assignments`))
        .set(asUser(s.memberToken))
        .send({ userId: s.member.id, role: 'RESPONSIBLE' });
      expect(assign.status).toBe(403);
    });

    it('cannot add notes to the project or to its tasks', async () => {
      const s = await viewerSetup();
      const onProject = await t
        .http()
        .post(api('/notes'))
        .set(asUser(s.memberToken))
        .send({ content: 'x', projectId: s.project.id });
      expect(onProject.status).toBe(403);
      const onTask = await t
        .http()
        .post(api('/notes'))
        .set(asUser(s.memberToken))
        .send({ content: 'x', taskId: s.task.id });
      expect(onTask.status).toBe(403);
    });

    it('is not restricted in projects where the user holds another role', async () => {
      const s = await viewerSetup();
      const other = await createProject(t.prisma, s.org.id);
      const response = await t
        .http()
        .patch(api(`/projects/${other.id}`))
        .set(asUser(s.memberToken))
        .send({ name: 'Anderes Projekt' });
      expect(response.status).toBe(200);
    });
  });

  describe('organization isolation', () => {
    async function twoOrganizations() {
      const s = await setup();
      const foreignOrg = await createOrganization(t.prisma);
      const foreignUser = await createUser(t.prisma, foreignOrg.id, 'MEMBER');
      const foreignProject = await createProject(t.prisma, foreignOrg.id);
      const foreignTask = await t.prisma.task.create({
        data: {
          organizationId: foreignOrg.id,
          createdByUserId: foreignUser.id,
          title: 'Fremd',
        },
      });
      return { ...s, foreignOrg, foreignUser, foreignProject, foreignTask };
    }

    it('rejects foreign users as project members (404)', async () => {
      const s = await twoOrganizations();
      const response = await t
        .http()
        .post(api(`/projects/${s.project.id}/members`))
        .set(asUser(s.adminToken))
        .send({ userId: s.foreignUser.id, role: 'CONTRIBUTOR' });
      expect(response.status).toBe(404);
      expect(await t.prisma.projectMember.count()).toBe(0);
    });

    it('rejects users without membership or archived users as project members', async () => {
      const s = await twoOrganizations();
      const stray = await createUser(t.prisma, null);
      const archived = await createUser(t.prisma, s.org.id, 'MEMBER', {
        archived: true,
      });
      for (const userId of [stray.id, archived.id]) {
        const response = await t
          .http()
          .post(api(`/projects/${s.project.id}/members`))
          .set(asUser(s.adminToken))
          .send({ userId, role: 'CONTRIBUTOR' });
        expect(response.status).toBe(404);
      }
    });

    it('rejects assigning foreign or archived users to a task (404)', async () => {
      const s = await twoOrganizations();
      const task = await t.prisma.task.create({
        data: {
          organizationId: s.org.id,
          createdByUserId: s.owner.id,
          title: 'Meine',
        },
      });
      const archived = await createUser(t.prisma, s.org.id, 'MEMBER', {
        archived: true,
      });
      for (const userId of [s.foreignUser.id, archived.id]) {
        const response = await t
          .http()
          .post(api(`/tasks/${task.id}/assignments`))
          .set(asUser(s.memberToken))
          .send({ userId, role: 'RESPONSIBLE' });
        expect(response.status).toBe(404);
      }
      expect(await t.prisma.taskAssignment.count()).toBe(0);

      const ok = await t
        .http()
        .post(api(`/tasks/${task.id}/assignments`))
        .set(asUser(s.memberToken))
        .send({ userId: s.member.id, role: 'RESPONSIBLE' });
      expect(ok.status).toBe(201);
    });

    it('hides foreign resources and refuses to change them (404)', async () => {
      const s = await twoOrganizations();
      const reads = [
        `/projects/${s.foreignProject.id}`,
        `/tasks/${s.foreignTask.id}`,
      ];
      for (const path of reads) {
        const response = await t
          .http()
          .get(api(path))
          .set(asUser(s.ownerToken));
        expect(response.status).toBe(404);
      }

      const patchProject = await t
        .http()
        .patch(api(`/projects/${s.foreignProject.id}`))
        .set(asUser(s.ownerToken))
        .send({ name: 'Übernommen' });
      expect(patchProject.status).toBe(404);
      const patchTask = await t
        .http()
        .patch(api(`/tasks/${s.foreignTask.id}`))
        .set(asUser(s.ownerToken))
        .send({ title: 'Übernommen' });
      expect(patchTask.status).toBe(404);

      const untouched = await t.prisma.project.findUniqueOrThrow({
        where: { id: s.foreignProject.id },
      });
      expect(untouched.name).not.toBe('Übernommen');
    });

    it('does not let a task or note point at a foreign project', async () => {
      const s = await twoOrganizations();
      const task = await t
        .http()
        .post(api('/tasks'))
        .set(asUser(s.memberToken))
        .send({ title: 'x', projectId: s.foreignProject.id });
      expect(task.status).toBe(404);
      const note = await t
        .http()
        .post(api('/notes'))
        .set(asUser(s.memberToken))
        .send({ content: 'x', projectId: s.foreignProject.id });
      expect(note.status).toBe(404);
    });

    it('does not expose foreign users or let admins manage them', async () => {
      const s = await twoOrganizations();
      const list = await t.http().get(api('/users')).set(asUser(s.ownerToken));
      expect(
        (list.body as { id: string }[]).some((u) => u.id === s.foreignUser.id),
      ).toBe(false);

      for (const [method, path, body] of [
        ['patch', `/users/${s.foreignUser.id}/role`, { role: 'ADMIN' }],
        ['post', `/users/${s.foreignUser.id}/deactivate`, undefined],
        ['post', `/users/${s.foreignUser.id}/revoke-sessions`, undefined],
      ] as const) {
        const response = await t
          .http()
          [method](api(path))
          .set(asUser(s.ownerToken))
          .send(body);
        expect(response.status).toBe(404);
      }
      const foreign = await t.prisma.user.findUniqueOrThrow({
        where: { id: s.foreignUser.id },
      });
      expect(foreign.archivedAt).toBeNull();
    });
  });
});
