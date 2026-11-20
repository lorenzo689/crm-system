// Node module-resolution hooks for the web unit tests: resolves the "@/"
// path alias and extensionless relative imports to the TypeScript sources,
// which Node runs directly (type stripping).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts"];

function isRelative(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

export async function resolve(specifier, context, nextResolve) {
  let base;
  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), root).href;
  } else if (isRelative(specifier) && context.parentURL) {
    base = new URL(specifier, context.parentURL).href;
  } else {
    return nextResolve(specifier, context);
  }
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    const path = fileURLToPath(candidate);
    if (existsSync(path) && !path.endsWith("\\") && !path.endsWith("/")) {
      if (suffix === "" && !/\.[cm]?[jt]sx?$/.test(path)) continue;
      return nextResolve(candidate, context);
    }
  }
  return nextResolve(specifier, context);
}

// Test-only: lets Node run the .tsx view components (JSX) by transpiling them
// with the TypeScript compiler that is already a dev dependency.
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const [{ default: ts }, { readFile }] = await Promise.all([
    import("typescript"),
    import("node:fs/promises"),
  ]);
  const source = await readFile(fileURLToPath(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
