<div align="center">

# ForgeTimers

ForgeTimers is an extension that makes `$setTimeout` and `$setInterval` survive a restart. Timers are persisted in ForgeDB or QuorielDB when scheduled, re-armed automatically the next time your app starts, and can be read with functions or reacted to through events.

<a href="https://github.com/Daaisukidayo/ForgeTimers/"><img src="https://img.shields.io/github/package-json/v/Daaisukidayo/ForgeTimers/main?label=forge.timers&color=5c16d4" alt="forge.timers"></a>
<a href="https://github.com/tryforge/ForgeScript/"><img src="https://img.shields.io/github/package-json/v/tryforge/ForgeScript/main?label=@tryforge/forgescript&color=5c16d4" alt="@tryforge/forgescript"></a>
<a href="https://discord.gg/yFW5Ju6JP8"><img src="https://img.shields.io/discord/997899472610795580?logo=discord" alt="Discord"></a>

</div>

---

## Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Storage](#storage)
4. [Reading timers](#reading-timers)
5. [Events](#events)

<h3 align="center">Installation</h3><hr>

1. Install the package.

   **From npm** - the stable release:
   ```bash
   npm i forge.timers
   ```

   **From GitHub** - `main` carries that same release:
   ```bash
   npm i github:Daaisukidayo/ForgeTimers#main
   ```

   And `dev` is where the next version is put together - take it to try what is coming, and expect it to break:
   ```bash
   npm i github:Daaisukidayo/ForgeTimers#dev
   ```


2. Install a database for the timers to live in.

   One of these has to be installed and listed in `extensions` next to it:

   ```bash
   npm i @tryforge/forge.db   # sqlite, mongodb, mysql or postgres
   ```
   ```bash
   npm i @quoriel/db          # lmdb
   ```

   Either will do, and [Storage](#storage) says how to pick between them. **ForgeScript 2.7.0** or newer is required in both cases.

3. Here's an example of how your main file should look:

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

At the top level, `ForgeTimers` accepts:

| Option | Type | Default | What it does |
|---|---|---|---|
| **`storage`** | `"forgedb"` or `"quorieldb"` | `"forgedb"` | Which extension keeps the timers. See [Storage](#storage). |
| **`migrateFrom`** | `"forgedb"` or `"quorieldb"` | — | Moves the stored timers out of that backend and into `storage`, once, on startup. See [Storage](#storage). |
| **`keepSource`** | `boolean` | `false` | Copies on migration instead of moving, leaving the old backend's timers where they are. |
| **`events`** | `TimerEvent[]` | — | Which timer events to listen to. See [Events](#events). |
| **`timeoutConfig`** | `ITimeoutConfig` | `{}` | How restored timeouts behave. Below. |
| **`intervalConfig`** | `IIntervalConfig` | `{}` | How restored intervals behave. Below. |
| **`pruneUnknownGuilds`** | `boolean` | `false` | Deletes timers belonging to a guild this process can't see, on startup. |

An invisible guild is far more often a Discord outage or another process's shard than a kick, and the deletion can't be undone. Turn `pruneUnknownGuilds` on only on a single unsharded process, where a missing guild really does mean the bot was removed.

Startup only compiles what it restores. Channels, messages and users are fetched when a timer actually fires, so booting with thousands of stored timers costs nothing extra, and a timer due next month is never discarded over an outage happening today. A timeout that could not reach Discord keeps its record and is retried on the next boot.

`timeoutConfig` and `intervalConfig` accept:

| Option | Kind | Type | Default | What it does |
|---|---|---|---|---|
| **`persist`** | both | `boolean` | `true` | Whether records are re-armed on startup. With `false`, timers are still written while the app runs, but the records are dropped on the next boot. |
| **`maxOverdue`** | both | `number` (ms) | no limit | How late a timer may be when the app comes back. |
| **`restoredTicksLimit`** | interval | `number` | `0` | How many ticks missed during downtime to replay: `0` none, `Infinity` all, `n` at most `n`. |

> ⚠️ **Warning**\
> `restoredTicksLimit: Infinity` on a 1-minute interval that was down for a day means 1440 executions on boot. Pair it with `maxOverdue` to bound the damage.

`maxOverdue` is measured against the timer's *due time* - a timer due next week is never affected by a week of downtime. What happens past the limit differs by kind: an overdue **timeout** is discarded, while an **interval** only skips the stale tick and resumes.

There is no upper bound on a duration: waits longer than node's own ~24.8 day limit are re-armed in chunks. An interval that survives a restart resumes on the time left on its current tick rather than waiting a whole fresh one, so its schedule doesn't drift with each restart.

A timer is only dropped when its channel is really gone. If Discord can't be reached at startup - an outage, a rate limit, a network failure - the record is kept and retried on the next boot instead.

A timer doesn't need a channel at all. One scheduled where there is none - a `clientReady` command, for instance - is persisted and restored just the same, and runs against the empty target ForgeScript gives that event. It belongs to no guild, so on a sharded bot it runs once, on shard 0, rather than once per shard.

<h3 align="center">Storage</h3><hr>

Timers go wherever you already keep your data. Pick the extension with `storage`:

```js
const timers = new ForgeTimers({
    storage: "quorieldb" // "forgedb" by default
})
```

| `storage` | Extension | Where the timers land | To install |
|---|---|---|---|
| **`"forgedb"`** | [ForgeDB](https://github.com/tryforge/ForgeDB) | Whatever it is connected to: sqlite, mongodb, mysql or postgres. | `npm i @tryforge/forge.db` |
| **`"quorieldb"`** | [QuorielDB](https://github.com/quoriel/db) | LMDB, under a `timers` record type. | `npm i @quoriel/db` |

**ForgeDB** needs nothing extra: set it up as usual and the timers follow. On sqlite that means a `timers.db` file next to ForgeDB's own database.

**QuorielDB** keeps them in its own store folder - `database`, unless you gave QuorielDB another `path`. The record type is registered on startup and your `config.json` is left alone, so there is nothing to add by hand, and the timers can be read with QuorielDB's own functions:

```js
$getRecord[timers;timeout:reminder]
```

> ⚠️ **Warning**\
> Only one of the two is used. Whichever you pick must be installed and listed in `extensions` - the extension refuses to load otherwise.

**Switching backends.** Timers already stored do not follow on their own. Point `migrateFrom` at the old backend for one boot:

```js
const timers = new ForgeTimers({
    storage: "quorieldb",
    migrateFrom: "forgedb"
})
```

Both extensions have to be in `extensions` for that boot - the old one is what the timers are read through. Drop `migrateFrom` and the old extension once the log says it is done.

The move happens before anything is restored, so deadlines carry over untouched. A name already taken in the new backend wins, and the timer that lost it is named in the log.

Each timer is written, read back, and only then dropped from the old backend, so a rerun cannot bring back one that has since fired. `keepSource: true` copies instead, and the migration then repeats every boot until `migrateFrom` goes.

<h3 align="center">Reading timers</h3><hr>

Stored timers can be read back from commands:

| Function | Returns | What it does |
|---|---|---|
| **`$getTimer[kind;name;property?]`** | one field, or the timer as JSON | Reads one timer. Without a property you get the whole data. |
| **`$getAllTimers[kind?]`** | JSON array | Every stored timer, optionally only the `timeout`s or the `interval`s. |
| **`$wipeTimers`** | number | Cancels every running timer and clears the stored ones. Returns how many were running. |

```js
$getTimer[timeout;reminder;timeLeft]
$getAllTimers[interval]
```

<h4 align="center">Properties</h4>

The third argument of `$getTimer`, and the names an [event](#events) reads with `$env`:

| Property | Type | What it is |
|---|---|---|
| **`id`** | string | `kind:name`, unique across the database. |
| **`name`** | string | The name the timer was scheduled under. Unique per kind. |
| **`kind`** | `timeout` or `interval` | Which of the two it is. |
| **`code`** | string | The ForgeScript the timer runs. |
| **`duration`** | number (ms) | The delay for a timeout, the tick length for an interval. |
| **`timestamp`** | number (unix ms) | When the timer was scheduled. |
| **`fireAt`** | number (unix ms) | When it is due next. |
| **`timeLeft`** | number (ms) | How long until then, from right now. Negative once it is overdue. |
| **`guildID`** | snowflake | The guild it was scheduled in, empty when it belongs to none. |
| **`channelID`** | snowflake | The channel it answers in, empty when it was scheduled outside one. |
| **`hostID`** | snowflake | Who scheduled it. |
| **`messageID`** | snowflake | The message it was scheduled from, if there was one. |
| **`args`** | JSON array | The command arguments present when it was scheduled. |

<h3 align="center">Events</h3><hr>

A timer's own code says what it does. Events say what happened to it - useful for logging, for telling a channel that a reminder was lost, or for watching what a restart picked up.

Name the ones you want, then write commands for them:

```js
const timers = new ForgeTimers({
    events: ["timerFire", "timerDrop"]
})

const client = new ForgeClient({ extensions: [db, timers] })

timers.commands.add({
    type: "timerDrop",
    code: `$sendMessage[$env[channelID];Lost the $env[kind] "$env[name]": $env[reason]]`
})

// or from a folder
timers.commands.load("events")
```

The events:

| Event | When | Extra `$env` |
|---|---|---|
| **`timerStart`** | A timer was scheduled. | — |
| **`timerFire`** | A timer's code ran: a timeout going off, or an interval ticking. | — |
| **`timerCancel`** | A timer was cancelled by hand, with `$clearTimeout`, `$clearInterval` or `$wipeTimers`. | — |
| **`timerRestore`** | A stored timer was picked back up after a restart. | `overdueBy` — how late it was, in ms. |
| **`timerDrop`** | A stored timer was thrown away without running. | `reason` — why it was thrown away. |

Every event reads its timer through `$env`, under the same names `$getTimer` uses. See [Properties](#properties).
