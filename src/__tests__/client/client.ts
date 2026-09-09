import { ForgeClient, ForgeExtension, LogPriority, FunctionManager } from "@tryforge/forgescript"
import { config } from "dotenv"
import { Events } from "discord.js"
import { ForgeTimers } from "../../index"
import { TimerEvent, TimerStorage } from "../../types"
import { join } from "node:path"
import { ForgeDB } from "@tryforge/forge.db"
import { CHANNEL, eventCode, EVENT_MESSAGE_CODE, readPlan, runSmoke, SEED_CODE } from "./smoke"
config()

/** Set by the restart check. Without it this file is the playground it has always been */
const smoke = process.env.SMOKE === "1"

/** Which backend to boot against. The playground stays on ForgeDB */
const storage = (process.env.SMOKE_STORAGE as TimerStorage) ?? "forgedb"

/** Set when this boot is the one that moves timers over */
const migrateFrom = process.env.SMOKE_MIGRATE_FROM as TimerStorage | undefined

/** The events the restart check watches. The playground keeps them off, as a bot would by default */
const WATCHED = [TimerEvent.timerStart, TimerEvent.timerFire, TimerEvent.timerRestore]

const timer = new ForgeTimers({
    storage,
    migrateFrom,
    events: smoke ? WATCHED : undefined,
    timeoutConfig: {
        // maxOverdue: 5_000
    },
    intervalConfig: {
        // replaying missed ticks would blur what the check is measuring
        restoredTicksLimit: smoke ? 0 : -1,
        // maxOverdue: 30_000
    },
})

function quorielDB(): ForgeExtension {
    const { QuorielDB } = require("@quoriel/db") as { QuorielDB: new () => ForgeExtension }
    return new QuorielDB()
}

const databaseFor = (which: TimerStorage) =>
    which === "quorieldb" ? quorielDB() : new ForgeDB({ type: "better-sqlite3" })

// the backend being migrated out of has to be loaded too, or its store cannot be read
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
        code: plan ? `$smokeReport[booted]` : SEED_CODE,
    })

    for (const event of WATCHED) timer.commands.add({ type: event, code: eventCode(event) })

    // one message from an event command is enough to know they can reach discord at all
    if (CHANNEL) timer.commands.add({ type: TimerEvent.timerFire, code: EVENT_MESSAGE_CODE })

    client.once(Events.ClientReady, () => void runSmoke(plan))
}

client.login()
