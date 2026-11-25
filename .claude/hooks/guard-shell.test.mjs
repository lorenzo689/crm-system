// Regression tests for guard-shell.mjs (run: node --test .claude/hooks/guard-shell.test.mjs).
// Each case starts the hook as Claude Code does: JSON event on stdin, exit
// code 2 = blocked, 0 = allowed. Git cases use throw-away repositories.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./guard-shell.mjs", import.meta.url));
const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "guard-shell-"));
  temps.push(dir);
  return dir;
}

function run(input, { env = process.env } = {}) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env,
  });
  return { code: result.status, stderr: result.stderr };
}

const shell = (command, cwd) => ({ tool_name: "Bash", cwd, tool_input: { command } });

function repoWith(files) {
  const dir = tempDir();
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
    git("add", "-f", path);
  }
  return dir;
}

describe("git commit: staged files", () => {
  it("allows a commit with ordinary staged files", () => {
    assert.equal(run(shell("git commit -m x", repoWith({ "ok.txt": "a" }))).code, 0);
  });

  it("allows .env.example", () => {
    assert.equal(run(shell("git commit -m x", repoWith({ ".env.example": "A=" }))).code, 0);
  });

  for (const path of ["apps/web/AGENTS.md", ".env.local", "apps/api/.env", "backup.agekey"]) {
    it(`blocks a commit while ${path} is staged`, () => {
      const result = run(shell("git commit -m x", repoWith({ "ok.txt": "a", [path]: "x" })));
      assert.equal(result.code, 2);
      assert.match(result.stderr, /must not be committed/);
    });
  }

  it("REGRESSION: blocks the commit when the staged files cannot be listed (not a repository)", () => {
    const result = run(shell("git commit -m x", tempDir()));
    assert.equal(result.code, 2);
    assert.match(result.stderr, /staged files could not be checked/);
  });

  it("REGRESSION: blocks the commit when git itself is not available", () => {
    const repo = repoWith({ "ok.txt": "a" });
    const result = run(shell("git commit -m x", repo), { env: { ...process.env, PATH: "", Path: "" } });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /staged files could not be checked/);
  });

  it("does not query git (and does not block) for commands other than commit", () => {
    assert.equal(run(shell("git status", tempDir())).code, 0);
  });
});

describe("command rules", () => {
  const blocked = [
    "git push origin main",
    "git push origin HEAD:main",
    "git push --force origin x",
    "git push -f",
    "git commit -m x --no-verify",
    "pnpm exec prisma migrate reset",
    "prisma db push --accept-data-loss",
    "docker volume rm data",
    "docker compose down -v",
    "docker system prune",
    "git add .env.staging",
    "git add apps/web/AGENTS.md",
  ];
  const allowed = [
    "git push origin tooling/claude-code-skills",
    "git push origin main-hotfix",
    "git status",
    "docker compose down",
    "git add docs/main.md",
  ];
  for (const command of blocked) {
    it(`blocks: ${command}`, () => assert.equal(run(shell(command, tempDir())).code, 2));
  }
  for (const command of allowed) {
    it(`allows: ${command}`, () => assert.equal(run(shell(command, tempDir())).code, 0));
  }
});

describe("unreadable input fails closed", () => {
  const inputs = ["not json", "", "[]", "null", '{"tool_name":"Bash"}', '{"tool_name":"Bash","tool_input":{"command":42}}'];
  for (const input of inputs) {
    it(`blocks: ${JSON.stringify(input)}`, () => assert.equal(run(input).code, 2));
  }
  it("leaves non-shell tools alone", () => {
    assert.equal(run({ tool_name: "Read", tool_input: { file_path: "x" } }).code, 0);
  });
});
