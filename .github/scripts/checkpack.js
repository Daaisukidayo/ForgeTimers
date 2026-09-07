const { execSync } = require("node:child_process")
const { readdirSync } = require("node:fs")
const { join, posix, relative, sep } = require("node:path")
const { main, types } = require("../../package.json")

const root = join(__dirname, "..", "..")

const [{ files }] = JSON.parse(execSync("npm pack --dry-run --json", { cwd: root, encoding: "utf8" }))

const shipped = files.map((file) => file.path)

const problems = []

const tests = shipped.filter((path) => path.includes("__tests__") || /\.test\.(js|d\.ts)$/.test(path))
if (tests.length) problems.push(`the package ships ${tests.length} test file(s): ${tests.slice(0, 5).join(", ")}`)

const dev = shipped.filter((path) => path.startsWith("dist/@build/"))
if (dev.length) problems.push(`the package ships dev scripts: ${dev.join(", ")}`)

for (const entry of [main, types]) {
    if (!shipped.includes(entry)) problems.push(`the package does not ship ${entry}, which package.json points at`)
}

function sourcesOf(folder) {
    const found = []

    for (const entry of readdirSync(join(root, folder), { withFileTypes: true, recursive: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue

        const path = join(relative(join(root, folder), entry.parentPath), entry.name)
        found.push(path.split(sep).join(posix.sep))
    }

    return found
}

const missing = sourcesOf("src/native")
    .map((path) => posix.join("dist/native", path.replace(/\.ts$/, ".js")))
    .filter((path) => !shipped.includes(path))

if (missing.length) problems.push(`the package is missing ${missing.length} native function(s): ${missing.join(", ")}`)

if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    process.exit(1)
}

console.log(`ok  ${shipped.length} files, every native function, no tests and no dev scripts`)
