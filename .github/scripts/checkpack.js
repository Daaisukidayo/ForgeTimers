const { execFileSync } = require("node:child_process")
const { main, types } = require("../../package.json")

const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const [{ files }] = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--json"], { encoding: "utf8" }))

const shipped = files.map((file) => file.path)

const problems = []

const tests = shipped.filter((path) => path.includes("__tests__") || /\.test\.(js|d\.ts)$/.test(path))
if (tests.length) problems.push(`the package ships ${tests.length} test file(s): ${tests.slice(0, 5).join(", ")}`)

const dev = shipped.filter((path) => /dist\/(commit|docgen|functions\/prompt)\./.test(path))
if (dev.length) problems.push(`the package ships dev scripts: ${dev.join(", ")}`)

for (const entry of [main, types]) {
    if (!shipped.includes(entry)) problems.push(`the package does not ship ${entry}, which package.json points at`)
}

if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    process.exit(1)
}

console.log(`ok  ${shipped.length} files, no tests and no dev scripts`)
