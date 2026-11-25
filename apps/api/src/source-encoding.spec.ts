import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * R2-01 regression: every text file in the repository is valid UTF-8 and
 * contains no replacement characters (the trace of a file that was decoded or
 * written with the wrong code page). Runs over all tracked and new files.
 */
const repoRoot = resolve(process.cwd(), '../..');
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/** Files that use U+FFFD on purpose, to detect failed decoding at runtime. */
const INTENTIONAL_REPLACEMENT_CHAR = new Set([
  'apps/api/src/modules/documents/documents.service.ts',
  'apps/web/app/(app)/finance/page.tsx',
]);

const TEXT_FILE =
  /\.(ts|tsx|js|mjs|cjs|json|md|sql|prisma|ya?ml|css|example|env|txt|html|toml)$|(^|\/)(Dockerfile|Caddyfile|\.env\.[\w.]+)$/;

function repositoryFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((file) => file && TEXT_FILE.test(file));
}

describe('source file encoding', () => {
  const files = repositoryFiles();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  it('finds the repository files', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('apps/api/src/modules/auth/auth.service.ts');
  });

  it('decodes every text file as UTF-8 without replacement characters', () => {
    const problems: string[] = [];
    for (const file of files) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(resolve(repoRoot, file));
      } catch {
        continue; // deleted in the working tree
      }
      let text: string;
      try {
        text = decoder.decode(bytes);
      } catch {
        problems.push(`${file}: not valid UTF-8`);
        continue;
      }
      if (
        text.includes(REPLACEMENT_CHAR) &&
        !INTENTIONAL_REPLACEMENT_CHAR.has(file)
      ) {
        const line = text
          .slice(0, text.indexOf(REPLACEMENT_CHAR))
          .split('\n').length;
        problems.push(`${file}:${line}: replacement character`);
      }
    }
    expect(problems).toEqual([]);
  });
});
