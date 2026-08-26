<div align="center">

# ForgeTimers

ForgeTimers is an extension that makes `$setTimeout` and `$setInterval` survive a restart. Timers are persisted when scheduled and re-armed automatically the next time your app starts.

<a href="https://github.com/Daaisukidayo/ForgeTimers/"><img src="https://img.shields.io/github/package-json/v/Daaisukidayo/ForgeTimers/main?label=forge.timers&color=5c16d4" alt="forge.timers"></a>
<a href="https://github.com/tryforge/ForgeScript/"><img src="https://img.shields.io/github/package-json/v/tryforge/ForgeScript/main?label=@tryforge/forgescript&color=5c16d4" alt="@tryforge/forgescript"></a>
<a href="https://discord.gg/yFW5Ju6JP8"><img src="https://img.shields.io/discord/739934735387721768?logo=discord" alt="Discord"></a>

</div>

---

## Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Storage](#storage)
4. [Reading timers](#reading-timers)

<h3 align="center">Installation</h3><hr>

> ⚠️ **Warning**\
> **ForgeTimers** requires the extension [**ForgeDB**](https://docs.botforge.org/p/ForgeDB/) installed in order to operate, and **ForgeScript 2.7.0** or newer.

1. Run the following command to install the required `npm` package:

   ```bash
   npm i github:Daaisukidayo/ForgeTimers @tryforge/forge.db
   ```

2. Here's an example of how your main file should look:

   ```js
   const { ForgeClient } = require("@tryforge/forgescript")
   const { ForgeTimers } = require("forge.timers")
   const { ForgeDB } = require("@tryforge/forge.db")

   const timers = new ForgeTimers({
       timeoutConfig: {
           maxOverdue: 86_400_000 // Discard timeouts over a day late
       },
       intervalConfig: {
           restoredTicksLimit: 5
       }
   })

   const db = new ForgeDB({
        ...options, // Change that to the options you currently have
   })

   const client = new ForgeClient({
       ...options, // Change that to the options you currently have
       extensions: [
           timers,
           db,
           // Add other extensions you installed here
       ]
   })

   client.login("YourToken")
   ```

The extension overrides `$setTimeout`, `$setInterval`, `$clearTimeout` and `$clearInterval`. Their syntax is unchanged.

> ⚠️ **Warning**\
> Only **named** timers are persisted. `$setTimeout[...;1h]` stays in memory as before, while `$setTimeout[...;1h;reminder]` survives a restart. Re-using a name cancels the timer currently registered under it.

<h3 align="center">Configuration</h3><hr>

Both `timeoutConfig` and `intervalConfig` accept:

- **`persist`** — whether records are re-armed on startup. Default `true`. With `false`, timers are still written while the app runs, but the records are dropped on the next boot.
- **`maxOverdue`** — how late (ms) a timer may be when the app comes back. Default: no limit.

`intervalConfig` additionally accepts:

- **`restoredTicksLimit`** — how many ticks missed during downtime to replay: `0` (default) replays none, `-1` replays all, `n` replays at most `n`.

> ⚠️ **Warning**\
> `restoredTicksLimit: -1` on a 1-minute interval that was down for a day means 1440 executions on boot. Pair it with `maxOverdue` to bound the damage.

`maxOverdue` is measured against the timer's *due time* - a timer due next week is never affected by a week of downtime. What happens past the limit differs by kind: an overdue **timeout** is discarded, while an **interval** only skips the stale tick and resumes.

<h3 align="center">Storage</h3><hr>

Timers are stored through **ForgeDB**, so they end up wherever you already keep your data - sqlite, mongodb, mysql or postgres. There's nothing extra to configure here: set ForgeDB up as usual and timers follow.

On sqlite that means a `timers.db` file next to ForgeDB's own database.

<h3 align="center">Reading timers</h3><hr>

Stored timers can be read back from scripts:

- **`$getTimer[kind;name;property?]`** - one timer. Without a property it returns the whole thing as JSON; with one it returns just that field. Available properties: `id`, `name`, `kind`, `code`, `duration`, `timestamp`, `fireAt`, `timeLeft`, `guildID`, `channelID`, `hostID`, `messageID`, `args`.
- **`$getAllTimers[kind?]`** - every stored timer as JSON, optionally filtered to `timeout` or `interval`.
- **`$wipeTimers`** - cancels every stored timer and clears them. Returns how many were running.

```js
$getTimer[timeout;reminder;timeLeft]
$getAllTimers[interval]
```