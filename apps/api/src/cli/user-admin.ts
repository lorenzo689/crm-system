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

Das Passwort wird immer verdeckt abgefragt, nie als Argument übergeben.`;

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

  const flags = readFlags(rest);
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

  const password = await readNewPassword();
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
