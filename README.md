<div align="center">

# ForgeTimers

ForgeTimers is an extension that makes `$setTimeout`, `$setInterval` and `$setCron` survive a restart. Timers are stored in ForgeDB or QuorielDB when scheduled and re-armed on the next start, and can be read with functions or reacted to through events.

<a href="https://github.com/Daaisukidayo/ForgeTimers/"><img src="https://img.shields.io/github/package-json/v/Daaisukidayo/ForgeTimers/main?label=forge.timers&color=5c16d4" alt="forge.timers"></a>
<a href="https://github.com/tryforge/ForgeScript/"><img src="https://img.shields.io/github/package-json/v/tryforge/ForgeScript/main?label=@tryforge/forgescript&color=5c16d4" alt="@tryforge/forgescript"></a>
<a href="https://discord.gg/yFW5Ju6JP8"><img src="https://img.shields.io/discord/997899472610795580?logo=discord" alt="Discord"></a>

</div>

---

## Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Storage](#storage)
4. [Cron](#cron)
5. [Reading timers](#reading-timers)
6. [Events](#events)
7. [Thanks](#thanks)

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

   And `dev` is where the next version is put together - take it to try what is coming, and expect it to break. It is also on npm under the `dev` tag:
   ```bash
   npm i github:Daaisukidayo/ForgeTimers#dev
   ```
   ```bash
   npm i forge.timers@dev
   ```


2. Install a database for the timers to live in.

   One of these has to be installed and listed in `extensions` next to it:

   ```bash
   npm i @tryforge/forge.db   # sqlite, mongodb, mysql or postgres
   ```
   ```bash
   npm i @quoriel/db          # lmdb
   ```

   Either will do, and [Storage](#storage) says how to pick between them. Both need **ForgeScript 2.7.0** or newer.

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

The extension overrides `$setTimeout`, `$setInterval`, `$clearTimeout` and `$clearInterval`. Existing calls keep working unchanged. `$setTimeout` and `$setInterval` take extra optional arguments, covered under [Configuration](#configuration).

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
| **`cronConfig`** | `ICronConfig` | `{}` | How restored crons behave. Below, same as an interval. |
| **`pruneUnknownGuilds`** | `boolean` | `false` | Deletes timers belonging to a guild the bot is no longer in, on startup. |

A timer is never held back by a guild it may never touch, and under sharding each one runs on exactly one shard.

A guild can go missing because of a Discord outage rather than a kick, and the deletion cannot be undone. Leave `pruneUnknownGuilds` off unless stale records are a real problem for you.

Booting with thousands of stored timers costs nothing extra, and a timer that could not reach Discord keeps its record and is retried on the next boot.

`timeoutConfig`, `intervalConfig` and `cronConfig` accept:

| Option | Kind | Type | Default | What it does |
|---|---|---|---|---|
| **`persist`** | all | `boolean` | `true` | Whether records are re-armed on startup. With `false`, timers are still written while the app runs, but the records are dropped on the next boot. |
| **`maxOverdue`** | all | `number` (ms) | no limit | How late a timer may be when the app comes back. |
| **`restoredTicksLimit`** | interval, cron | `number` | `0` | How many ticks missed during downtime to replay. `0` replays none, `Infinity` all, and `n` at most `n`. |

> ⚠️ **Warning**\
> `restoredTicksLimit: Infinity` on a 1-minute interval that was down for a day means 1440 executions on boot. Pair it with `maxOverdue` to bound the damage.

`maxOverdue` counts from the timer's *due time*. A timer due next week is never affected by a week of downtime. Past the limit a **timeout** is discarded, while an **interval** or a **cron** skips the stale run and carries on.

Any of them can also be set on one timer, as arguments:

```js
$setTimeout[code;time;name;persist;maxOverdue]
$setInterval[code;time;name;persist;maxOverdue;restoredTicksLimit]
$setCron[code;expression;name;timezone;persist;maxOverdue;restoredTicksLimit]
```

Leave an argument out to fall back to the config:

```js
$setInterval[...;1m;example;;;Infinity]
```

That interval replays every missed tick whatever `intervalConfig.restoredTicksLimit` says, and still takes `persist` and `maxOverdue` from the config.

A duration has no upper bound - months are fine. An interval that survives a restart resumes on the time left on its current tick, which keeps restarts from pushing its schedule later.

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

**ForgeDB** needs nothing extra. Set it up as usual and the timers follow. On sqlite that means a `timers.db` file next to ForgeDB's own database.

**QuorielDB** keeps them in its own store folder - `database`, unless you gave QuorielDB another `path`. The record type is registered on startup and your `config.json` is left alone. There is nothing to set up. The timers can be read with QuorielDB's own functions:

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

Both extensions have to be in `extensions` for that boot, since the old one is what the timers are read through. Drop `migrateFrom` and the old extension once the log says it is done.

Deadlines carry over untouched. If a name is already taken in the new backend, the one already there wins and the other is named in the log.

Running the migration twice is safe. It cannot bring back a timer that has since fired. `keepSource: true` copies instead of moving, which means it repeats every boot until `migrateFrom` goes.

<h3 align="center">Cron</h3><hr>

An interval keeps a gap, a cron keeps the **wall clock**. A 24 hour interval drifts by an hour twice a year, while `0 9 * * *` stays at nine in the morning through every daylight saving change.

```js
$setCron[$sendMessage[$channelID;standup];0 9 * * 1-5;standup;Europe/Kyiv]
```

| Function | Returns | What it does |
|---|---|---|
| **`$setCron[code;expression;name;timezone?;persist?;maxOverdue?;restoredTicksLimit?]`** | — | Runs code on a cron expression. Aliased as `$cron`. |
| **`$clearCron[name]`** | boolean | Cancels a cron and forgets it. Aliased as `$stopCron` and `$deleteCron`. |

<h3 align="center">Reading timers</h3><hr>

Stored timers can be read back from commands:

| Function | Returns | What it does |
|---|---|---|
| **`$getTimer[kind;name;property?]`** | one field, or the timer as JSON | Reads one timer. Without a property you get the whole data. |
| **`$getAllTimers[kind?;property?;separator?]`** | JSON array, or one joined string | Every stored timer, optionally only one kind of them. |
| **`$findTimer[property;value;...]`** | JSON array | Every stored timer whose properties all match. Aliased as `$findTimers`. |
| **`$clearTimers[property;value;...]`** | number | Cancels and forgets every one of those, and says how many. Aliased as `$stopTimers` and `$deleteTimers`. |
| **`$timersCount[kind?]`** | number | How many timers are stored, of one kind or of every kind. |
| **`$timerExists[kind;name]`** | boolean | Whether a timer is **stored** under that name, running or not. |
| **`$timerRunning[kind;name]`** | boolean | Whether one is **armed** under that name right now. |
| **`$rescheduleTimer[kind;name;schedule;timezone?]`** | boolean | Gives a stored timer a new schedule, keeping everything else it was scheduled with. |
| **`$pauseTimer[kind;name]`** | boolean | Puts a timer on hold, keeping what is left of its wait. |
| **`$resumeTimer[kind;name]`** | boolean | Starts a paused timer again, from where its wait was left. |
| **`$executeTimer[kind;name]`** | boolean | Runs a stored timer's code now, leaving the timer itself untouched. Aliased as `$runTimer`. |
| **`$clearTimer[kind;name]`** | boolean | Cancels a timer of any kind and forgets it. Aliased as `$stopTimer` and `$deleteTimer`. |
| **`$wipeTimers`** | number | Cancels every running timer and clears the stored ones. Returns how many were running. |
| **`$timerData[property?]`** | one field, or the timer as JSON | Reads the timer an [event](#events) is about. |

```js
$getTimer[timeout;reminder;timeLeft]
$getAllTimers[interval]
```

`$getAllTimers` gives the whole of every timer by default. Name a property to get just that one as a list, and add a separator to get plain text instead:

```js
$getAllTimers[interval;name]        // ["beat","daily"]
$getAllTimers[interval;name;, ]     // beat, daily
```

`$findTimer` takes [properties](#properties) and values in pairs, and returns every timer where **all** of them match:

```js
$findTimer[channelID;$channelID]            // everything waiting on this channel
$findTimer[authorID;$authorID;kind;cron]      // this user's crons
$findTimer[paused;true]                     // everything on hold
```

`$clearTimers` takes the same pairs and cancels everything they match, returning how many. `$clearTimer[kind;name]` cancels one of any kind.

`$executeTimer` runs the timer's code now and changes nothing else. The deadline stays, the record stays, an interval does not count it as a tick, and no [event](#events) is reported. It runs a paused timer too.

These two ask about different places, and either can be true on its own:

```js
$timerExists[timeout;reminder]    // there is a record in the database
$timerRunning[timeout;reminder]   // something is counting down in this process
```

A paused timer is stored but not armed. One scheduled while the database was down is armed but not stored.

Pausing keeps the record and the time left, and a restart leaves the timer paused. `$resumeTimer` starts it again from where it stopped, rebuilt from the record with the variables it was scheduled with. `$rescheduleTimer` leaves it paused too, with the whole new wait ahead.

`$rescheduleTimer` takes a duration for a timeout or an interval, and an expression for a cron.

```js
$rescheduleTimer[timeout;reminder;30m]
$rescheduleTimer[cron;standup;0 17 * * 1-5]
$rescheduleTimer[cron;standup;0 9 * * 1-5;Europe/London]   // and a new zone with it
```

<h4 align="center">Properties</h4>

The third argument of `$getTimer`, and the names an [event](#events) reads with `$timerData`:

| Property | Type | What it is |
|---|---|---|
| **`id`** | string | `kind:name`, unique across the database. |
| **`name`** | string | The name the timer was scheduled under. Unique per kind. |
| **`kind`** | `timeout`, `interval` or `cron` | Which of the three it is. |
| **`code`** | string | The ForgeScript the timer runs. |
| **`duration`** | number (ms) | The delay for a timeout, the tick length for an interval. Always `0` for a cron, which keeps no gap. |
| **`cron`** | string | The expression a cron runs on, empty for the kinds that keep a gap instead. |
| **`timezone`** | string | The zone that expression is read in. Empty for the kinds that keep a gap instead. |
| **`timestamp`** | number (unix ms) | When the timer was scheduled. |
| **`fireAt`** | number (unix ms) | When it is due next. |
| **`timeLeft`** | number (ms) | How long until then, from right now. Negative once it is overdue. |
| **`paused`** | boolean | Whether it is on hold. A paused timer keeps its `timeLeft` frozen where `$pauseTimer` left it. |
| **`guildID`** | snowflake | The guild it was scheduled in, empty when it belongs to none. |
| **`channelID`** | snowflake | The channel it answers in, empty when it was scheduled outside one. |
| **`authorID`** | snowflake | Who scheduled it. |
| **`messageID`** | snowflake | The message it was scheduled from, if there was one. |
| **`args`** | JSON array | The command arguments present when it was scheduled. |
| **`config`** | JSON object | The options the call spelled out for this timer, empty when it named none. |

<h3 align="center">Events</h3><hr>

A timer's own code says what it does. Events say what happened to it - for logging, for telling a channel that a reminder was lost, or for watching what a restart picked up.

Name the ones you want, then write commands for them:

```js
const timers = new ForgeTimers({
    events: ["timerFire", "timerDrop"]
})

const client = new ForgeClient({ extensions: [db, timers] })

timers.commands.add({
    type: "timerDrop",
    code: `$sendMessage[$timerData[channelID];Lost the $timerData[kind] "$timerData[name]": $eventData[dropReason]]`
})

// or from a folder
timers.commands.load("events")
```

The events:

| Event | When | Also reads |
|---|---|---|
| **`timerStart`** | A timer was scheduled. | — |
| **`timerFire`** | A timer's code ran, whether a timeout going off, an interval ticking or a cron coming round. | — |
| **`timerCancel`** | A timer was cancelled by hand, with any of the `$clear` functions or `$wipeTimers`. | — |
| **`timerPause`** | A timer was put on hold. | — |
| **`timerResume`** | A timer on hold was started again. | — |
| **`timerRestore`** | A stored timer was picked back up after a restart. | `overdueBy` — how late it was, in ms. |
| **`timerDrop`** | A stored timer was thrown away without running - too late, unreadable, or its code no longer compiles. | `dropReason`, and `overdueBy` when that was the reason. |
| **`timersReady`** | Startup finished dealing with every stored timer. | `restored` and `dropped`. |
| **`databaseConnect`** | The storage opened, and timers will survive a restart. | — |
| **`databaseFail`** | The storage could not be opened, and nothing will be persisted. | `failReason`. |

Every event reads its timer with `$timerData`, under the same names `$getTimer` uses. See [Properties](#properties). A timer's own code reads itself the same way, which lets an interval log its own name.

Whatever the event adds on top of its timer is read with `$eventData`, under the names in the last column:

```js
$timerData[channelID]       // one property of the timer
$timerData                  // all of them, as JSON

$eventData[dropReason]      // one thing the event added
$eventData                  // all of them, as JSON
```

An event that **changed** a timer also carries what it looked like before, read with `$oldTimer` and `$newTimer` the way `$oldMessage` and `$newMessage` work in ForgeScript:

```js
$oldTimer[fireAt]    // when it was due before this
$newTimer[fireAt]    // when it is due now
```

An interval or cron tick carries both, as do `timerPause` and `timerResume`. Everything else carries only `$newTimer`.

`timersReady` does not fire when the storage could not be opened - `databaseFail` fires instead. Exactly one of the two database events happens on every boot.

<h3 align="center">Thanks</h3><hr>

Cron support here follows the trail [ForgeCron](https://github.com/Tape490/ForgeCron) blazed for ForgeScript, with thanks to [Tape](https://github.com/Tape490) for waving it on.
