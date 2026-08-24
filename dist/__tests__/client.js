"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const dotenv_1 = require("dotenv");
const discord_js_1 = require("discord.js");
const main_1 = require("../main");
const node_path_1 = require("node:path");
(0, dotenv_1.config)();
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
        new main_1.ForgeTimers({
            timeoutConfig: {
            // maxOverdue: 5_000
            },
            intervalConfig: {
                restoredTicksLimit: -1,
                // maxOverdue: 30_000
            }
        })
    ],
    mobile: true,
    prefixes: ["!", "<@$botID>"],
    token: process.env.TOKEN
});
// ---------------------------------------------------------------
// 1. [RESTART] Baseline: does a timeout survive at all?
// Run it, restart within 20s, expect the message after the restart.
//  TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-basic",
    code: `
    $setTimeout[
        $sendMessage[$channelID;[1\\] basic timeout fired]
    ;60s;t-basic]
    $sendMessage[$channelID;scheduled [1\\], restart now]
    `,
});
// ---------------------------------------------------------------
// 2. [RESTART] Variables: $let must survive
// Expect "num=10", NOT "num=<>".
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-vars",
    code: `
    $let[num;10]
    $setTimeout[
        $sendMessage[$channelID;[2\\] num=<$get[num]>]
    ;20s;t-vars]
    $sendMessage[$channelID;scheduled [2\\], restart now]
    `,
});
// ---------------------------------------------------------------
// 3. Snapshot is taken at scheduling time, not at fire time.
// The value is changed AFTER scheduling; expect "before", not "after".
// Works without a restart too.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-snapshot",
    code: `
    $let[state;before]
    $setTimeout[
        $sendMessage[$channelID;[3\\] state=<$get[state]> (expected: before)]
    ;20s;t-snapshot]
    $let[state;after]
    $sendMessage[$channelID;scheduled [3\\]]
    `,
});
// ---------------------------------------------------------------
// 4. Name reuse must REPLACE, not duplicate.
// Expect exactly one message saying "second", never "first".
// A warning about replacing should appear in the console.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-replace",
    code: `
    $setTimeout[$sendMessage[$channelID;[4\\] FIRST - should never appear];15s;t-dup]
    $setTimeout[$sendMessage[$channelID;[4\\] SECOND - this one only];15s;t-dup]
    $sendMessage[$channelID;scheduled [4\\], expect exactly one message]
    `,
});
// ---------------------------------------------------------------
// 5. Clearing must remove the store record too.
// Run, then restart before the 20s elapse: nothing should fire.
// The record in .forge/timers.db must be gone immediately.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-clear",
    code: `
    $setTimeout[$sendMessage[$channelID;[5\\] FAILED - cleared timer fired];20s;t-clear]
    $clearTimeout[t-clear]
    $sendMessage[$channelID;scheduled+cleared [5\\], nothing should fire]
    `,
});
// ---------------------------------------------------------------
// 6. [RESTART] Unnamed timers are intentionally NOT persisted.
// Before restart: fires normally. After restart: nothing.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-unnamed",
    code: `
    $setTimeout[$sendMessage[$channelID;[6\\] unnamed fired];20s]
    $sendMessage[$channelID;scheduled [6\\] unnamed - should NOT survive restart]
    `,
});
// ---------------------------------------------------------------
// 7. [RESTART] Overdue: fire immediately if the due time already passed.
// Schedule for 5s, stay offline for 30+ seconds, then start.
// Expect the message right at startup.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-overdue",
    code: `
    $setTimeout[$sendMessage[$channelID;[7\\] overdue timeout fired on boot];5s;t-overdue]
    $sendMessage[$channelID;scheduled [7\\], now stay offline for 2+ minutes]
    `,
});
// ---------------------------------------------------------------
// 8. [RESTART] maxOverdue: too-late timeouts get dropped.
// Set timeoutConfig.maxOverdue to 60_000, schedule this, stay offline
// for 1+ minute. Expect NO message and a warning in the console.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-maxoverdue",
    code: `
    $setTimeout[$sendMessage[$channelID;[8\\] FAILED - should have been discarded];10s;t-maxoverdue]
    $sendMessage[$channelID;scheduled [8\\], stay offline past maxOverdue]
    `,
});
// ---------------------------------------------------------------
// 9. [RESTART] Intervals resume after a restart.
// Expect a tick every 5s, continuing across the restart.
// Stop it with: t-interval-stop
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-interval",
    code: `
    $let[tag;persisted]
    $setInterval[
        $sendMessage[$channelID;[9\\] tick - tag=<$get[tag]>]
    ;5s;t-interval]
    $sendMessage[$channelID;started [9\\], restart to verify it resumes]
    `,
});
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-interval-stop",
    code: `
    $clearInterval[t-interval]
    $sendMessage[$channelID;stopped [9\\]]
    `,
});
// ---------------------------------------------------------------
// 10. [RESTART] restoredTicksLimit: replaying missed ticks.
// With restoredTicksLimit: 3, start this, stay offline ~15 seconds,
// then boot. Expect exactly 3 catch-up messages, then the normal
// cadence. With the default 0, expect none.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-replay",
    code: `
    $setInterval[$sendMessage[$channelID;[10\\] replayed/normal tick];3s;t-replay]
    $sendMessage[$channelID;started [10\\], go offline ~1 minute]
    `,
});
// ---------------------------------------------------------------
// 11. [RESTART] Only the stale tick is skipped. Set intervalConfig.maxOverdue to
// 60_000, start this, stay offline 1+ minute.
// Expect: no catch-up burst, but ticks DO continue after boot.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-late-interval",
    code: `
    $setInterval[$sendMessage[$channelID;[11\\] interval survived being late];5s;t-late]
    $sendMessage[$channelID;started [11\\], go offline past maxOverdue]
    `,
});
// ---------------------------------------------------------------
// 12. persist: false - records are wiped on startup instead of re-armed.
// Set timeoutConfig.persist to false, run this, restart.
// Expect: nothing fires, and .forge/timers.db is empty afterwards.
// TEST PASSED
// ---------------------------------------------------------------
client.commands.add({
    type: discord_js_1.Events.MessageCreate,
    name: "t-nopersist",
    code: `
    $setTimeout[$sendMessage[$channelID;[14\\] FAILED - persist:false fired];20s;t-nopersist]
    $sendMessage[$channelID;scheduled [14\\], restart with persist:false]
    `,
});
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