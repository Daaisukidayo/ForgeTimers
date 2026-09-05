import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database, TimerKind } from "../../structures"

export const SEEDED = "SMOKE:SEEDED"
export const PASS = "SMOKE:PASS"
export const FAIL = "SMOKE:FAIL"

export const TIMEOUT_NAME = "smoke-timeout"
export const INTERVAL_NAME = "smoke-interval"

export const TIMEOUT_DELAY = "60s"
export const INTERVAL_TICK = "20s"

export const TOLERANCE = 3000

const MARKER = join(process.cwd(), ".forgetimers-smoke.json")

export interface ISmokePlan {
    timeoutDueAt: number
    seededAt: number
}

export function readPlan(): ISmokePlan | null {
    if (!existsSync(MARKER)) return null

    try {
        return JSON.parse(readFileSync(MARKER, "utf8")) as ISmokePlan
    } catch {
        return null
    }
}

export function clearPlan() {
    rmSync(MARKER, { force: true })
}

export const reports: Array<{ label: string; at: number }> = []

export function report(label: string) {
    reports.push({ label, at: Date.now() })
}

const bootedAt = Date.now()

const seen = (label: string, after = 0) => reports.find((r) => r.label === label && r.at >= after)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)))

export async function runSmoke(plan: ISmokePlan | null) {
    try {
        if (plan) await verify(plan)
        else await seed()
    } catch (err) {
        console.error(err)
        console.log(FAIL)
        process.exit(1)
    }
}

async function seed() {
    const scheduled = await until(() => seen("seeded"), 30_000)
    if (!scheduled) throw new Error("the clientReady command never scheduled the smoke timers")

    const row = await Database.get(TimerKind.timeout, TIMEOUT_NAME)
    if (!row) throw new Error(`${TIMEOUT_NAME} was scheduled but never persisted`)

    writeFileSync(
        MARKER,
        JSON.stringify({ timeoutDueAt: row.fireAt, seededAt: Date.now() } satisfies ISmokePlan, null, 2),
        "utf8"
    )

    console.log(`due at ${new Date(row.fireAt).toISOString()}, ${Math.round(row.timeLeft() / 1000)}s from now`)
    console.log(SEEDED)
}

async function verify(plan: ISmokePlan) {
    const left = plan.timeoutDueAt - Date.now()
    console.log(`waiting ${Math.round(left / 1000)}s for the deadline set before the restart`)

    await wait(left + TOLERANCE + 1000)

    const fired = seen("timeout", bootedAt)
    const drift = fired ? fired.at - plan.timeoutDueAt : null
    const ticked = seen("interval", bootedAt)
    const row = await Database.get(TimerKind.timeout, TIMEOUT_NAME)

    const checks = [
        ["the timeout ran after the restart", !!fired],
        [`it ran on its original deadline (drift ${drift ?? "n/a"}ms)`, drift !== null && Math.abs(drift) <= TOLERANCE],
        ["the interval kept ticking", !!ticked],
        ["the spent timeout was deleted", row === null],
    ] as const

    for (const [what, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${what}`)

    clearPlan()
    await Database.delete(TimerKind.timeout, TIMEOUT_NAME).catch(() => undefined)
    await Database.delete(TimerKind.interval, INTERVAL_NAME).catch(() => undefined)

    const passed = checks.every(([, ok]) => ok)
    console.log(passed ? PASS : FAIL)
    process.exit(passed ? 0 : 1)
}

async function until(condition: () => unknown, timeout: number) {
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
        if (condition()) return true
        await wait(50)
    }

    return !!condition()
}
