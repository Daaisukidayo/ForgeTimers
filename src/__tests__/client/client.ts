import { ForgeClient, ForgeExtension, LogPriority, FunctionManager } from "@tryforge/forgescript"
import { config } from "dotenv"
import { Events } from "discord.js"
import { ForgeTimers } from "../../index"
import { TimerEvent } from "../../types"
import { TimerStorage } from "../../structures"
import { join } from "node:path"
import { ForgeDB } from "@tryforge/forge.db"
import { CHANNEL, eventCode, EVENT_MESSAGE_CODE, readPlan, runSmoke, SEED_CODE, VERIFY_CODE } from "./smoke"
config()

/** Set by the restart check. Without it this file is just the playground. */
const smoke = process.env.SMOKE === "1"

/** Backend to boot against. The playground stays on ForgeDB. */
const storage = (process.env.SMOKE_STORAGE as TimerStorage) ?? "forgedb"

/** Set when this boot moves the timers over. */
const migrateFrom = process.env.SMOKE_MIGRATE_FROM as TimerStorage | undefined

/** Events the restart check watches. Off in the playground, like a bot by default. */
const WATCHED = [TimerEvent.timerStart, TimerEvent.timerFire, TimerEvent.timerRestore]

const timer = new ForgeTimers({
    storage,
    migrateFrom,
    events: smoke ? WATCHED : undefined,
    timeoutConfig: {
        // maxOverdue: 5_000
    },
    intervalConfig: {
        // replayed ticks would blur what the check measures
        restoredTicksLimit: smoke ? 0 : Infinity,
        // maxOverdue: 30_000
    },
})

function quorielDB(): ForgeExtension {
    const { QuorielDB } = require("@quoriel/db") as { QuorielDB: new () => ForgeExtension }
    return new QuorielDB()
}

const databaseFor = (which: TimerStorage) =>
    which === "quorieldb" ? quorielDB() : new ForgeDB({ type: "better-sqlite3" })

// the old backend has to be loaded too, else its store can't be read
const databases =
    migrateFrom && migrateFrom !== storage ? [databaseFor(storage), databaseFor(migrateFrom)] : [databaseFor(storage)]

const client = new ForgeClient({
    logLevel: LogPriority.High,
    intents: ["Guilds", "MessageContent", "GuildMessages", "DirectMessages"],
    events: ["clientReady", "messageCreate"],
    extensions: [...databases, timer],
    mobile: true,
    prefixes: ["!", "<@$botID>"],
    token: process.env.TOKEN,
})

for (const database of databases) if (database instanceof ForgeDB) database.variables({})

client.commands.add({
    type: Events.ClientReady,
    code: `
    $logger[Info;Ready on client $username[$botID]]
    $setStatus[online;Custom;Testing ForgeTimers]
    `,
})

client.commands.add({
    name: "eval",
    aliases: ["e"],
    type: Events.MessageCreate,
    code: `
    $let[text;$eval[$message;false]]
    $if[$charCount[$get[text]]>1950;$attachment[$get[text];result.json;true];$codeBlock[$get[text];JSON]]
    `,
})

client.commands.add({
    name: "js",
    type: Events.MessageCreate,
    code: `
        $let[text;$replace[$djsEval[$message];<ref *1> ;;1]]
        $if[$charCount[$get[text]]>1950;$attachment[$get[text];result.json;true];$codeBlock[$get[text];JSON]]
    `,
})

FunctionManager.load(join(__dirname, "custom"))

if (smoke) {
    const plan = readPlan()

    client.commands.add({
        type: Events.ClientReady,
        code: plan ? VERIFY_CODE : SEED_CODE,
    })

    for (const event of WATCHED) timer.commands.add({ type: event, code: eventCode(event) })

    // one message from an event command proves they reach discord
    if (CHANNEL) timer.commands.add({ type: TimerEvent.timerFire, code: EVENT_MESSAGE_CODE })

    client.once(Events.ClientReady, () => void runSmoke(plan))
}

client.login()
