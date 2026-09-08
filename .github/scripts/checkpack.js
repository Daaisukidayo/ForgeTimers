const { execSync } = require("node:child_process")
const { readdirSync } = require("node:fs")
const { join, posix, relative, sep } = require("node:path")
const { main, types } = require("../../package.json")

const root = join(__dirname, "..", "..")

const [{ files }] = JSON.parse(execSync("npm pack --dry-run --json", { cwd: root, encoding: "utf8" }))

const shipped = files.map((file) => file.path)

const ROOT_FILES = ["README.md", "LICENSE", "package.json"]

const belongs = (path) =>
    ROOT_FILES.includes(path) ||
    (path.startsWith("dist/") && !path.startsWith("dist/__tests__/") && !path.startsWith("dist/@build/"))

/** Every .ts under a source folder, as paths relative to it */
function sourcesOf(folder) {
    const found = []

    for (const entry of readdirSync(join(root, folder), { withFileTypes: true, recursive: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue

        const path = join(relative(join(root, folder), entry.parentPath), entry.name)
        found.push(path.split(sep).join(posix.sep))
    }

    return found
}

const problems = []

const stray = shipped.filter((path) => !belongs(path))
if (stray.length) problems.push(`the package ships ${stray.length} file(s) it should not: ${stray.slice(0, 8).join(", ")}`)

for (const entry of [main, types]) {
    if (!shipped.includes(entry)) problems.push(`the package does not ship ${entry}, which package.json points at`)
}

const missing = sourcesOf("src/native")
    .map((path) => posix.join("dist/native", path.replace(/\.ts$/, ".js")))
    .filter((path) => !shipped.includes(path))

if (missing.length) problems.push(`the package is missing ${missing.length} native function(s): ${missing.join(", ")}`)

if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    process.exit(1)
}

console.log(`ok  ${shipped.length} files, nothing stray, every native function`)
