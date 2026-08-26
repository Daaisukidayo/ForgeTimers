"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const dotenv_1 = require("dotenv");
const discord_js_1 = require("discord.js");
const index_1 = require("../index");
const node_path_1 = require("node:path");
const forge_db_1 = require("@tryforge/forge.db");
(0, dotenv_1.config)();
const timer = new index_1.ForgeTimers({
    timeoutConfig: {
    // maxOverdue: 5_000
    },
    intervalConfig: {
        restoredTicksLimit: -1,
        // maxOverdue: 30_000
    }
});
const db = new forge_db_1.ForgeDB({
    type: "better-sqlite3"
});
const client = new forgescript_1.ForgeClient({
    logLevel: forgescript_1.LogPriority.High,
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
});
db.variables({});
client.commands.add({
    type: discord_js_1.Events.ClientReady,
    code: `
    $logger[Info;Ready on client $username[$botID]]
    $setStatus[online;Custom;Testing ForgeTimers]
    `
});
client.commands.add({
    name: "eval",
    aliases: ["e"],
    type: discord_js_1.Events.MessageCreate,
    code: `
    $eval[$message]
    `
});
client.commands.add({
    name: "js",
    type: discord_js_1.Events.MessageCreate,
    code: `
        $if[$true==true;Ping: \`$pingMS\` | Uptime: <t:$round[$math[$math[$getTimestamp-$uptime]/1000];0]:R>;]                
        $let[text;$replace[$djsEval[const channel = ctx.message.channel \nconst message = ctx.message \nconst author = ctx.message.author \nconst client = ctx.message.client \nconst guild = ctx.message.guild \n$message];<ref *1> ;;1]]
        $if[$charCount[$get[text]]>1950;$attachment[$get[text];result.json;true];$codeBlock[$get[text];JSON]]
    `,
});
forgescript_1.FunctionManager.load((0, node_path_1.join)(__dirname, "custom"));
client.login();
//# sourceMappingURL=client.js.map