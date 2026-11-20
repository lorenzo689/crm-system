/**
 * Central catalogue and configuration of scheduled background jobs.
 *
 * Every `@Cron` in the code base must use one of these names; the
 * BackgroundJobsService refuses to start with an unknown cron so no new job
 * can run without being classified here.
 *
 * Configuration (env):
 * - APP_ENV=staging|production|development (deployment stage, independent of
 *   NODE_ENV). Staging may only run maintenance jobs.
 * - BACKGROUND_JOBS: `all`, `none`, `maintenance` or a comma-separated list of
 *   job names. Default: `maintenance` on staging, `all` elsewhere (keeps the
 *   existing production behaviour).
 */
export type JobKind = 'maintenance' | 'business';

export interface JobDefinition {
  kind: JobKind;
  /** Talks to systems outside this deployment (IMAP, AI provider, e-mail). */
  external: boolean;
  description: string;
  /**
   * Lease time-to-live. NOT an upper bound of a run: a running job renews its
   * lease by heartbeat. The TTL is how long a crashed or frozen instance keeps
   * the job blocked before another instance may take over.
   */
  leaseSeconds: number;
}

/** How often a running job extends its lease (must stay well below the TTL). */
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** How long shutdown waits for running jobs to stop cooperatively. */
export const SHUTDOWN_GRACE_MS = 10_000;

export const BACKGROUND_JOBS = {
  'session-purge': {
    kind: 'maintenance',
    external: false,
    description: 'Deletes sessions that ended more than 24 h ago (hourly).',
    leaseSeconds: 120,
  },
  'calendar-reminders': {
    kind: 'business',
    external: true,
    description:
      'Sends due calendar reminders as notifications/e-mail (every minute).',
    leaseSeconds: 120,
  },
  'inbox-poll': {
    kind: 'business',
    external: true,
    description:
      'Fetches unread mails via IMAP and classifies them with AI (every 5 minutes).',
    leaseSeconds: 120,
  },
  'ai-agents': {
    kind: 'business',
    external: true,
    description:
      'Creates AI proposals for overdue invoices, open quotes, stock (daily 06:00).',
    leaseSeconds: 120,
  },
  'recurring-invoices': {
    kind: 'business',
    external: false,
    description:
      'Creates invoice drafts from recurring invoice templates (daily 05:00).',
    leaseSeconds: 120,
  },
} as const satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof BACKGROUND_JOBS;

export const JOB_NAMES = Object.keys(BACKGROUND_JOBS) as JobName[];

export function isJobName(value: string): value is JobName {
  return Object.hasOwn(BACKGROUND_JOBS, value);
}

export function getAppEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return (env.APP_ENV ?? '').trim().toLowerCase();
}

export function isStaging(env: NodeJS.ProcessEnv = process.env) {
  return getAppEnvironment(env) === 'staging';
}

/** Resolves BACKGROUND_JOBS into the set of enabled job names. */
export function getEnabledJobs(
  env: NodeJS.ProcessEnv = process.env,
): Set<JobName> {
  const raw = (env.BACKGROUND_JOBS ?? '').trim().toLowerCase();
  const value = raw || (isStaging(env) ? 'maintenance' : 'all');

  if (value === 'all') return new Set(JOB_NAMES);
  if (value === 'none') return new Set();
  if (value === 'maintenance') {
    return new Set(
      JOB_NAMES.filter((name) => BACKGROUND_JOBS[name].kind === 'maintenance'),
    );
  }

  const enabled = new Set<JobName>();
  for (const entry of value.split(',').map((part) => part.trim())) {
    if (!entry) continue;
    if (!isJobName(entry)) {
      throw new Error(
        `BACKGROUND_JOBS contains an unknown job "${entry}". Known: ${JOB_NAMES.join(', ')}`,
      );
    }
    enabled.add(entry);
  }
  return enabled;
}

const STAGING_MAIL_HOSTS = new Set(['mailpit', 'localhost', '127.0.0.1']);

/**
 * Staging must never act on the outside world: no business jobs, no AI key,
 * no IMAP, and mail only into the internal capture service. Fails startup.
 */
export function assertBackgroundJobConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  const enabled = getEnabledJobs(env);
  if (!isStaging(env)) return;

  const business = [...enabled].filter(
    (name) => BACKGROUND_JOBS[name].kind === 'business',
  );
  if (business.length > 0) {
    throw new Error(
      `APP_ENV=staging must not enable business jobs: ${business.join(', ')}`,
    );
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('APP_ENV=staging requires an empty ANTHROPIC_API_KEY.');
  }
  if (env.IMAP_HOST?.trim()) {
    throw new Error('APP_ENV=staging must not configure IMAP_HOST.');
  }
  const smtpHost = env.SMTP_HOST?.trim() ?? '';
  if (smtpHost && !STAGING_MAIL_HOSTS.has(smtpHost)) {
    throw new Error(
      `APP_ENV=staging only sends mail to the internal capture service (${[...STAGING_MAIL_HOSTS].join(', ')}), not to "${smtpHost}".`,
    );
  }
  if (env.SMTP_USER?.trim() || env.SMTP_PASSWORD?.trim()) {
    throw new Error(
      'APP_ENV=staging must not use SMTP credentials (mail is captured, never relayed).',
    );
  }
}
