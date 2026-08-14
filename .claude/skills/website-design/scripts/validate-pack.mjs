import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const packRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const skillsRoot = path.join(packRoot, "skills");
const manifestPath = path.join(packRoot, "sources.lock.json");
const errors = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entries = manifest.skills;
const manifestNames = entries.map((entry) => entry.name);
const uniqueNames = new Set(manifestNames);

if (uniqueNames.size !== manifestNames.length) {
  errors.push("sources.lock.json contains duplicate skill names");
}

const skillDirs = fs
  .readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const missingFromDisk = manifestNames.filter((name) => !skillDirs.includes(name));
const missingFromManifest = skillDirs.filter((name) => !uniqueNames.has(name));

if (missingFromDisk.length) {
  errors.push(`Missing skill directories: ${missingFromDisk.join(", ")}`);
}
if (missingFromManifest.length) {
  errors.push(`Unmanifested skill directories: ${missingFromManifest.join(", ")}`);
}

for (const skillName of skillDirs) {
  const skillDir = path.join(skillsRoot, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillFile)) {
    errors.push(`${skillName}: missing SKILL.md`);
    continue;
  }

  const content = fs.readFileSync(skillFile, "utf8");
  const frontmatterName = content.match(/^---\s*[\s\S]*?^name:\s*([^\n]+)$/m)?.[1]?.trim();
  if (frontmatterName !== skillName) {
    errors.push(`${skillName}: frontmatter name is ${frontmatterName ?? "missing"}`);
  }

  for (const markdownFile of walk(skillDir).filter((file) => file.endsWith(".md"))) {
    const markdown = fs.readFileSync(markdownFile, "utf8");
    const links = markdown.matchAll(/\]\(([^)]+)\)/g);

    for (const match of links) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, "");
      if (/^(https?:|mailto:|#)/.test(rawTarget)) continue;

      const targetWithoutAnchor = rawTarget.split("#", 1)[0];
      if (!targetWithoutAnchor || targetWithoutAnchor.includes("$")) continue;

      const resolvedTarget = path.resolve(path.dirname(markdownFile), targetWithoutAnchor);
      if (!fs.existsSync(resolvedTarget)) {
        errors.push(`${path.relative(packRoot, markdownFile)}: broken link ${rawTarget}`);
      }
    }
  }
}

const gitArtifacts = walk(packRoot).filter((file) => file.split(path.sep).includes(".git"));
if (gitArtifacts.length) {
  errors.push("Pack contains .git artifacts");
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`PASS: ${skillDirs.length} skills validated; manifest and local links are consistent.`);
