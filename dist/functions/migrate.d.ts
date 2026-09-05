import { ForgeClient } from "@tryforge/forgescript";
import { TimerStorage } from "../structures/Database";
export interface IMigrationResult {
    moved: number;
    /** Names already taken in the target, left where they were */
    skipped: string[];
    /** Whether the source was drained, and so whether a rerun would be a no-op */
    drained: boolean;
}
/**
 * Moves every stored timer from one backend to the other.
 *
 * First copies, second reads the copy back, and only then drops the original.
 *
 * @param client The client both extensions are loaded on.
 * @param from The backend to move timers out of.
 * @param to The backend to move them into.
 * @param keepSource Whether to leave the originals behind instead of dropping them.
 * @returns What was moved, or null if the source could not be opened.
 */
export declare function migrateTimers(client: ForgeClient, from: TimerStorage, to: TimerStorage, keepSource?: boolean): Promise<IMigrationResult | null>;
//# sourceMappingURL=migrate.d.ts.map