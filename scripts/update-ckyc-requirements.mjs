import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIREMENTS_FILE = path.join(ROOT, "APPLICATION_REQUIREMENTS.md");
const START_MARKER = "<!-- CKYC_REQUIREMENTS_AUTO_START -->";
const END_MARKER = "<!-- CKYC_REQUIREMENTS_AUTO_END -->";
const POLL_INTERVAL_MS = 1_500;
const WATCH_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".toml",
  ".yaml",
  ".yml",
]);
const WATCH_ROOTS = [
  "artifacts/ckyc-manager/src",
  "artifacts/api-server/src",
  "artifacts/ckyc-manager/vite.config.ts",
  "artifacts/ckyc-manager/.replit-artifact/artifact.toml",
  "artifacts/api-server/.replit-artifact/artifact.toml",
  "lib/api-spec/openapi.yaml",
  "lib/db/src/schema",
  "artifacts/ckyc-manager/package.json",
  "artifacts/api-server/package.json",
  "package.json",
  "pnpm-workspace.yaml",
];
const GIT_CHANGE_PATHS = [
  "artifacts/ckyc-manager/src",
  "artifacts/api-server/src",
  "artifacts/ckyc-manager/vite.config.ts",
  "artifacts/ckyc-manager/.replit-artifact/artifact.toml",
  "artifacts/api-server/.replit-artifact/artifact.toml",
  "lib/api-spec/openapi.yaml",
  "lib/db/src/schema",
  "artifacts/ckyc-manager/package.json",
  "artifacts/api-server/package.json",
  "package.json",
  "pnpm-workspace.yaml",
];

async function listFilesRecursively(relativeDirectory) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  let entries;

  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      ["dist", "node_modules", "coverage", ".git"].includes(entry.name)
    ) {
      continue;
    }

    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(relativePath)));
    } else if (entry.isFile() && WATCH_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
}

async function getWatchedFiles() {
  const files = [];
  for (const relativePath of WATCH_ROOTS) {
    const absolutePath = path.join(ROOT, relativePath);
    try {
      const item = await stat(absolutePath);
      if (item.isDirectory()) {
        files.push(...(await listFilesRecursively(relativePath)));
      } else if (item.isFile()) {
        files.push(relativePath);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return [...new Set(files)].sort();
}

async function readPackageSummary(relativePath, label) {
  const packageJson = JSON.parse(
    await readFile(path.join(ROOT, relativePath), "utf8"),
  );
  const runtimeCount = Object.keys(packageJson.dependencies ?? {}).length;
  const developmentCount = Object.keys(packageJson.devDependencies ?? {}).length;
  const scripts = ["dev", "build", "serve", "start", "test", "typecheck"]
    .filter((name) => packageJson.scripts?.[name])
    .map((name) => `\`${name}\``);

  return `- ${label}: ${runtimeCount} runtime and ${developmentCount} development dependencies; scripts: ${scripts.join(", ") || "none listed"}.`;
}

async function listDirectFiles(relativeDirectory, expression) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && expression.test(entry.name))
    .map((entry) => path.posix.join(relativeDirectory, entry.name))
    .sort();
}

async function findEnvironmentNames(files) {
  const names = new Set();
  const patterns = [
    /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  ];

  for (const relativePath of files) {
    const content = await readFile(path.join(ROOT, relativePath), "utf8");
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        names.add(match[1] ?? match[2]);
      }
    }
  }
  return [...names].sort();
}

function getWorkingTreeChanges() {
  try {
    const output = execFileSync(
      "git",
      ["status", "--short", "--untracked-files=all", "--", ...GIT_CHANGE_PATHS],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return output ? output.split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

function markdownList(values, emptyMessage) {
  return values.length
    ? values.map((value) => `- \`${value}\``).join("\n")
    : `- ${emptyMessage}`;
}

async function buildInventory() {
  const files = await getWatchedFiles();
  const pageFiles = await listDirectFiles(
    "artifacts/ckyc-manager/src/pages",
    /\.(tsx|jsx|ts|js)$/,
  );
  const routeFiles = await listDirectFiles(
    "artifacts/api-server/src/routes",
    /\.(ts|js)$/,
  );
  const schemaFiles = await listDirectFiles(
    "lib/db/src/schema",
    /\.(ts|js)$/,
  );
  const testFiles = files.filter((file) => /\.test\.(ts|tsx|js|jsx)$/.test(file));
  const environmentNames = await findEnvironmentNames(files);
  const packageSummaries = await Promise.all([
    readPackageSummary("package.json", "Workspace"),
    readPackageSummary(
      "artifacts/ckyc-manager/package.json",
      "`@workspace/ckyc-manager`",
    ),
    readPackageSummary(
      "artifacts/api-server/package.json",
      "`@workspace/api-server`",
    ),
  ]);
  const changes = getWorkingTreeChanges();
  const timestamp = new Date().toISOString();

  return [
    "## Auto-generated implementation inventory",
    "",
    `Last refreshed: ${timestamp}`,
    "",
    "### Frontend pages",
    markdownList(pageFiles, "No page files found."),
    "",
    "### API route modules",
    markdownList(routeFiles, "No route files found."),
    "",
    "### Database schema modules",
    markdownList(schemaFiles, "No schema files found."),
    "",
    "### Test files",
    markdownList(testFiles, "No test files found."),
    "",
    "### Dependency manifests",
    ...packageSummaries,
    "",
    "### Environment variable names detected in source",
    "Names only are listed; values are never read.",
    environmentNames.length
      ? `\`${environmentNames.join("`, `")}\``
      : "No environment variable names detected.",
    "",
    "### Current implementation-file changes",
    ...(changes.length
      ? changes.map((change) => `- \`${change.replaceAll("`", "'")}\``)
      : ["- No uncommitted implementation-file changes detected."]),
  ].join("\n");
}

async function syncRequirements() {
  const original = await readFile(REQUIREMENTS_FILE, "utf8");
  const start = original.indexOf(START_MARKER);
  const end = original.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Expected generated inventory markers in ${path.relative(ROOT, REQUIREMENTS_FILE)}.`,
    );
  }

  const inventory = await buildInventory();
  const updated = [
    original.slice(0, start + START_MARKER.length),
    "",
    inventory,
    "",
    original.slice(end),
  ].join("\n");
  if (updated !== original) {
    await writeFile(REQUIREMENTS_FILE, updated, "utf8");
    process.stdout.write("Updated APPLICATION_REQUIREMENTS.md\n");
  } else {
    process.stdout.write("APPLICATION_REQUIREMENTS.md is up to date\n");
  }
}

async function fingerprintWatchedFiles() {
  const files = await getWatchedFiles();
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update(await readFile(path.join(ROOT, relativePath)));
  }
  return hash.digest("hex");
}

async function watchRequirements() {
  let previousFingerprint = await fingerprintWatchedFiles();
  await syncRequirements();
  process.stdout.write(
    "Watching CKYC implementation files. Press Ctrl+C to stop.\n",
  );

  let syncing = false;
  const timer = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const currentFingerprint = await fingerprintWatchedFiles();
      if (currentFingerprint !== previousFingerprint) {
        previousFingerprint = currentFingerprint;
        await syncRequirements();
      }
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
    } finally {
      syncing = false;
    }
  }, POLL_INTERVAL_MS);

  const stop = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv.includes("--watch")) {
  await watchRequirements();
} else {
  await syncRequirements();
}