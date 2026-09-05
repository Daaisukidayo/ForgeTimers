"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const dotenv_1 = require("dotenv");
const discord_js_1 = require("discord.js");
const index_1 = require("../../index");
const node_path_1 = require("node:path");
const forge_db_1 = require("@tryforge/forge.db");
const smoke_1 = require("./smoke");
(0, dotenv_1.config)();
/** Set by the restart check. Without it this file is the playground it has always been */
const smoke = process.env.SMOKE === "1";
/** Which backend to boot against. The playground stays on ForgeDB */
const storage = process.env.SMOKE_STORAGE ?? "forgedb";
/** Set when this boot is the one that moves timers over */
const migrateFrom = process.env.SMOKE_MIGRATE_FROM;
const timer = new index_1.ForgeTimers({
    storage,
    migrateFrom,
    timeoutConfig: {
    // maxOverdue: 5_000
    },
    intervalConfig: {
        // replaying missed ticks would blur what the check is measuring
        restoredTicksLimit: smoke ? 0 : -1,
        // maxOverdue: 30_000
    }
});
function quorielDB() {
    const { QuorielDB } = require("@quoriel/db");
    return new QuorielDB();
}
const databaseFor = (which) => which === "quorieldb" ? quorielDB() : new forge_db_1.ForgeDB({ type: "better-sqlite3" });
// the backend being migrated out of has to be loaded too, or its store cannot be read
const databases = migrateFrom && migrateFrom !== storage
    ? [databaseFor(storage), databaseFor(migrateFrom)]
    : [databaseFor(storage)];
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
        ...databases,
        timer
    ],
    mobile: true,
    prefixes: ["!", "<@$botID>"],
    token: process.env.TOKEN
});
for (const database of databases)
    if (database instanceof forge_db_1.ForgeDB)
        database.variables({});
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
        $let[text;$replace[$djsEval[$message];<ref *1> ;;1]]
        $if[$charCount[$get[text]]>1950;$attachment[$get[text];result.json;true];$codeBlock[$get[text];JSON]]
    `,
});
forgescript_1.FunctionManager.load((0, node_path_1.join)(__dirname, "custom"));
if (smoke) {
    const plan = (0, smoke_1.readPlan)();
    client.commands.add({
        type: discord_js_1.Events.ClientReady,
        code: plan
            ? `$smokeReport[booted]`
            : `$setTimeout[$smokeReport[timeout];${smoke_1.TIMEOUT_DELAY};${smoke_1.TIMEOUT_NAME}]` +
                `$setInterval[$smokeReport[interval];${smoke_1.INTERVAL_TICK};${smoke_1.INTERVAL_NAME}]` +
                `$smokeReport[seeded]`,
    });
    client.once(discord_js_1.Events.ClientReady, () => void (0, smoke_1.runSmoke)(plan));
}
client.login();
//# sourceMappingURL=client.js.map