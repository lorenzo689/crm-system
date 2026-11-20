import 'dotenv/config';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  bootstrapOwner,
  createUser,
  findEmailConflicts,
  PROVISIONABLE_ROLES,
  ProvisioningError,
} from '../modules/users/user-provisioning';
import type { OrganizationMemberRole } from '../../generated/prisma/client';

const USAGE = `Bissinger OS Benutzerverwaltung

  user-admin bootstrap   --email <mail> --name <Name>
      Legt den ersten Owner an (nur möglich, solange es noch keinen Owner gibt).

  user-admin create-user --email <mail> --name <Name> --role <ADMIN|MEMBER>
      Legt ein weiteres Konto an.

  user-admin check-emails
      Listet Konten, deren E-Mail-Adressen sich nur in Gross-/Kleinschreibung
      unterscheiden (vor der Migration zur eindeutigen E-Mail ausfuehren).

Das Passwort wird verdeckt abgefragt, nie als Argument übergeben.
Für Automatisierung (Deployment-Skripte, Restore-Tests) liest
--password-stdin es stattdessen als erste Zeile von der Standardeingabe,
z. B. aus einer Datei mit Rechten 0600:
  user-admin bootstrap --email <mail> --name <Name> --password-stdin < pw.txt`;

const PASSWORD_STDIN_FLAG = '--password-stdin';

/** Reads the first line of a non-interactive stdin (never echoed or logged). */
async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const firstLine = Buffer.concat(chunks)
    .toString('utf8')
    .split(String.fromCharCode(10))[0];
  const password = firstLine.endsWith(String.fromCharCode(13))
    ? firstLine.slice(0, -1)
    : firstLine;
  if (!password) {
    throw new ProvisioningError('Kein Passwort auf der Standardeingabe.');
  }
  return password;
}

function readFlags(args: string[]) {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new ProvisioningError(`Ungültiges Argument: ${key ?? ''}`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(
        new ProvisioningError(
          'Passwort-Eingabe nur in einem interaktiven Terminal möglich.',
        ),
      );
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function readNewPassword() {
  const password = await promptHidden('Passwort: ');
  const confirmation = await promptHidden('Passwort wiederholen: ');
  if (password !== confirmation) {
    throw new ProvisioningError('Die Passwörter stimmen nicht überein.');
  }
  return password;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'check-emails') {
    const prisma = new PrismaService();
    try {
      const conflicts = await findEmailConflicts(prisma);
      if (conflicts.length === 0) {
        console.log('Keine E-Mail-Konflikte gefunden.');
      } else {
        for (const conflict of conflicts) {
          console.log(`${conflict.email}: ${conflict.accounts} Konten`);
        }
        console.log(
          'Bitte manuell klären (keine automatische Zusammenführung).',
        );
        process.exitCode = 2;
      }
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (command !== 'bootstrap' && command !== 'create-user') {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
    return;
  }

  const passwordFromStdin = rest.includes(PASSWORD_STDIN_FLAG);
  const flags = readFlags(rest.filter((arg) => arg !== PASSWORD_STDIN_FLAG));
  if (!flags.email || !flags.name) {
    throw new ProvisioningError('--email und --name sind erforderlich.');
  }

  let role: OrganizationMemberRole = 'OWNER';
  if (command === 'create-user') {
    if (!(PROVISIONABLE_ROLES as readonly string[]).includes(flags.role)) {
      throw new ProvisioningError(
        `--role muss ${PROVISIONABLE_ROLES.join(' oder ')} sein.`,
      );
    }
    role = flags.role as OrganizationMemberRole;
  }

  const password = passwordFromStdin
    ? await readPasswordFromStdin()
    : await readNewPassword();
  const prisma = new PrismaService();
  try {
    const input = {
      email: flags.email,
      displayName: flags.name,
      password,
    };
    const account =
      command === 'bootstrap'
        ? await bootstrapOwner(prisma, input)
        : await createUser(prisma, { ...input, role });
    // Only non-sensitive facts are printed: no password, hash or token.
    console.log(`Konto angelegt: ${account.email} (${account.role})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProvisioningError) {
    console.error(`Fehler: ${error.message}`);
  } else {
    console.error('Unerwarteter Fehler beim Anlegen des Kontos.');
  }
  process.exitCode = 1;
});
