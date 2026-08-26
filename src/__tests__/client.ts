import { ForgeClient, LogPriority, FunctionManager } from "@tryforge/forgescript"
import { config } from "dotenv"
import { Events } from "discord.js"
import { ForgeTimers } from "../index"
import { join } from "node:path"
import { ForgeDB } from "@tryforge/forge.db"
config()

const timer = new ForgeTimers({
    timeoutConfig: {
        // maxOverdue: 5_000
    },
    intervalConfig: {
        restoredTicksLimit: -1,
        // maxOverdue: 30_000
    }
})

const db = new ForgeDB({
    type: "better-sqlite3"
})

const client = new ForgeClient({
    logLevel: LogPriority.High,
    intents: [
        "Guilds",
        "MessageContent",
        "GuildMessages",
        "DirectMessages",
    ],
    events: [
        "clientReady",
        "messageCreate",
    ],
    extensions: [
        db,
        timer
    ],
    mobile: true,
    prefixes: ["!", "<@$botID>"],
    token: process.env.TOKEN
})

db.variables({})


client.commands.add({
    type: Events.ClientReady,
    code: `
    $logger[Info;Ready on client $username[$botID]]
    $setStatus[online;Custom;Testing ForgeTimers]
    `
})

client.commands.add({
    name: "eval",
    aliases: ["e"],
    type: Events.MessageCreate,
    code: `
    $eval[$message]
    `
})

client.commands.add({
    name: "js",
    type: Events.MessageCreate,
    code: `
        $if[$true==true;Ping: \`$pingMS\` | Uptime: <t:$round[$math[$math[$getTimestamp-$uptime]/1000];0]:R>;]                
        $let[text;$replace[$djsEval[const channel = ctx.message.channel \nconst message = ctx.message \nconst author = ctx.message.author \nconst client = ctx.message.client \nconst guild = ctx.message.guild \n$message];<ref *1> ;;1]]
        $if[$charCount[$get[text]]>1950;$attachment[$get[text];result.json;true];$codeBlock[$get[text];JSON]]
    `,
})

FunctionManager.load(join(__dirname, "custom"))

client.login()