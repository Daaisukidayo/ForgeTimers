import { spawn } from "node:child_process"
import { join } from "node:path"
import {
    bold,
    clearPlan,
    cyan,
    DOWNTIME,
    FAIL,
    green,
    grey,
    INTERVAL_TICK,
    OVERDUE_DELAY,
    PASS,
    red,
    SEEDED,
    SPEED,
    TIMEOUT_DELAY,
    yellow,
} from "./smoke"

const BOT = join(__dirname, "client.js")

const BOOT_TIMEOUT = 60_000
const VERIFY_TIMEOUT = 180_000

/** One boot schedules, the next checks. When the two differ, the timers have to move between them */
interface IScenario {
    /** What SMOKE_ONLY matches, exactly */
    id: string
    label: string
    seed: string
    verify: string
}

const SCENARIOS: IScenario[] = [
    { id: "forgedb", label: "forgedb", seed: "forgedb", verify: "forgedb" },
    { id: "quorieldb", label: "quorieldb", seed: "quorieldb", verify: "quorieldb" },
    { id: "to-quorieldb", label: "forgedb -> quorieldb", seed: "forgedb", verify: "quorieldb" },
    { id: "to-forgedb", label: "quorieldb -> forgedb", seed: "quorieldb", verify: "forgedb" },
]

interface IPhase {
    /** What the bot printed that ended the phase, or null if it timed out */
    matched: string | null
    code: number | null
}

/**
 * Runs the bot until it prints one of `sentinels`, or until it exits on its own.
 * @param env What to hand the bot on top of this process's own environment.
 * @param label What to call this phase in the log.
 * @param sentinels Lines that end the phase.
 * @param timeout How long to give it.
 * @param killOnMatch Whether a match should stop the bot rather than wait for it to exit.
 */
function phase(env: Record<string, string>, label: string, sentinels: string[], timeout: number, killOnMatch: boolean) {
    return new Promise<IPhase>((resolve) => {
        console.log("\n" + cyan(`=== ${label} ===`))

        const bot = spawn(process.execPath, [BOT], {
            env: { ...process.env, FORCE_COLOR: "1", SMOKE: "1", SMOKE_SPEED: String(SPEED), ...env },
            stdio: ["ignore", "pipe", "inherit"],
        })

        let matched: string | null = null
        let settled = false
        let rest = ""

        const done = (code: number | null) => {
            if (settled) return
            settled = true
            clearTimeout(guard)
            resolve({ matched, code })
        }

        const guard = setTimeout(() => {
            console.error(yellow(`${label} timed out after ${Math.round(timeout / 1000)}s`))
            stop()
        }, timeout)

        function stop() {
            if (bot.exitCode !== null) return
            bot.kill()
            // a bot that ignores the polite ask still has to go
            setTimeout(() => bot.kill("SIGKILL"), 5000).unref()
        }

        bot.stdout.on("data", (chunk: Buffer) => {
            process.stdout.write(chunk)

            // a sentinel can land split across two chunks
            rest += chunk.toString()
            const found = sentinels.find((s) => rest.includes(s))
            if (!found || matched) return

            matched = found
            if (killOnMatch) stop()
        })

        bot.on("exit", (code) => done(code))
        bot.on("error", (err) => {
            console.error(red(String(err instanceof Error ? err.stack : err)))
            done(1)
        })
    })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Schedules on one boot and checks on the next.
 * @param scenario Which backends the two boots run on.
 * @returns Whether the timers came back intact.
 */
async function check(scenario: IScenario) {
    console.log("\n" + bold(cyan(`########## ${scenario.label} ##########`)))

    // a run that died mid-way would otherwise send us straight to verifying
    clearPlan()

    const first = await phase({ SMOKE_STORAGE: scenario.seed }, "run 1 of 2 - scheduling", [SEEDED], BOOT_TIMEOUT, true)
    if (first.matched !== SEEDED) {
        console.error("\n" + red("the bot never scheduled its timers, so there is nothing to restart into"))
        return false
    }

    console.log("\n" + grey(`stopped. staying down ${Math.round(DOWNTIME / 1000)}s`))
    await wait(DOWNTIME)

    // a differing backend means the second boot has to migrate before it can restore
    const moving = scenario.seed !== scenario.verify
    const env: Record<string, string> = { SMOKE_STORAGE: scenario.verify }
    if (moving) env.SMOKE_MIGRATE_FROM = scenario.seed

    const label = moving ? "run 2 of 2 - migrating and verifying" : "run 2 of 2 - verifying"
    const second = await phase(env, label, [PASS, FAIL], VERIFY_TIMEOUT, false)
    if (second.matched === PASS) return true

    console.error(
        "\n" + red(second.matched === FAIL ? "the restart check failed" : "the bot stopped before it could report")
    )
    return false
}

async function main() {
    // one scenario when named, otherwise all of them, because each can break alone
    const only = process.env.SMOKE_ONLY?.split(",")
        .map((id) => id.trim())
        .filter(Boolean)

    const wanted = only?.length ? only : SCENARIOS.map((s) => s.id)
    const scenarios = SCENARIOS.filter((s) => wanted.includes(s.id))

    if (!scenarios.length) {
        console.error(
            red(`No scenario called "${wanted.join(", ")}". Pick from: ${SCENARIOS.map((s) => s.id).join(", ")}`)
        )
        process.exit(1)
    }

    console.log(
        grey(
            `clock x${SPEED}: ${TIMEOUT_DELAY} deadline, ${INTERVAL_TICK} tick, ${OVERDUE_DELAY} while down, ` +
                `${Math.round(DOWNTIME / 1000)}s down, ${scenarios.length} of ${SCENARIOS.length} scenarios`
        )
    )

    const failed: string[] = []

    for (const scenario of scenarios) {
        if (!(await check(scenario))) failed.push(scenario.label)
    }

    console.log("")
    for (const scenario of scenarios) {
        console.log(`${failed.includes(scenario.label) ? red("FAIL") : green("ok  ")} ${scenario.label}`)
    }

    process.exit(failed.length ? 1 : 0)
}

void main()
