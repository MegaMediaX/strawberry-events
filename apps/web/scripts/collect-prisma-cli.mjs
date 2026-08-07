/**
 * Collect the prisma CLI and its dependency closure into a directory that can
 * be copied into the production image.
 *
 * The runner image is built from Next's standalone output, which only contains
 * what the APP imports at runtime — the CLI is a devDependency and its
 * dependencies (effect, c12, citty, …) are not traced. Copying
 * `node_modules/prisma` alone therefore produces a CLI that starts and then
 * dies with "Cannot find module 'effect'", which is exactly how a deploy
 * failed once migrations were finally invoked correctly.
 *
 * The closure is computed rather than enumerated so it keeps working when
 * Prisma changes its own dependencies.
 *
 * Usage: node scripts/collect-prisma-cli.mjs <outDir> [nodeModulesDir]
 */
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
const modulesDir = process.argv[3] ?? "node_modules";

if (!outDir) {
  console.error("usage: node scripts/collect-prisma-cli.mjs <outDir> [nodeModulesDir]");
  process.exit(1);
}

/** Entry points: the CLI itself, plus the client the app needs at runtime. */
const ROOTS = ["prisma", "@prisma/client"];

function dependenciesOf(pkg) {
  const manifest = path.join(modulesDir, pkg, "package.json");
  if (!fs.existsSync(manifest)) return null;
  const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
  // Optional deps are intentionally included: Prisma resolves platform-specific
  // engines through them, and a missing one surfaces only at runtime.
  return Object.keys({ ...json.dependencies, ...json.optionalDependencies });
}

const closure = new Set();
const missing = [];
const stack = [...ROOTS];
while (stack.length > 0) {
  const pkg = stack.pop();
  if (closure.has(pkg)) continue;
  closure.add(pkg);
  const deps = dependenciesOf(pkg);
  if (deps === null) {
    missing.push(pkg);
    continue;
  }
  for (const dep of deps) if (!closure.has(dep)) stack.push(dep);
}

let copied = 0;
let bytes = 0;
for (const pkg of closure) {
  const from = path.join(modulesDir, pkg);
  if (!fs.existsSync(from)) continue;
  const to = path.join(outDir, pkg);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: true });
  copied += 1;
  for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) bytes += fs.statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size;
  }
}

console.log(`prisma CLI closure: ${copied} packages, ${(bytes / 1e6).toFixed(0)} MB -> ${outDir}`);
// Packages absent from node_modules are normal (bundled deps, platform builds).
if (missing.length > 0) console.log(`not present locally (skipped): ${missing.join(", ")}`);
