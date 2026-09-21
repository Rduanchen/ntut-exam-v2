import { SystemSettings } from "../models/system-settings.model";
import { rehearsalRunSchema } from "../schemas/rehearsal.schema";
import type { RehearsalRun } from "../types/rehearsal.type";

/**
 * Where the rehearsal report lives.
 *
 * `SystemSettings` rather than a table of its own, and that choice is what
 * makes the report survive the rehearsal's own cleanup: `wipeAllData()` drops
 * the exam tables and purges three named settings keys, so an ordinary key
 * here is untouched. The alternative — teaching the global reset about
 * rehearsals — would push this feature's concerns into the exam's main line
 * for no gain.
 *
 * Only the most recent run is kept. Enough for "we checked before the exam",
 * which is all anyone has asked the report to prove.
 */
export const REHEARSAL_SETTING_KEY = "post_deploy_rehearsal_latest";

/**
 * The configuration the machine had before the rehearsal overwrote it.
 *
 * `wipeAllData()` does not touch `exam_config` — it has no reason to, since a
 * reset returns the machine to "no exam", not "no settings". But the rehearsal
 * does overwrite it, so without this the machine is left holding the rehearsal
 * paper: the next rehearsal refuses itself as `exam_data_present`, and the
 * operator's config page shows an exam nobody is sitting.
 *
 * Restoring rather than writing a default is deliberate. The judging settings
 * live inside `exam_config`, and one of them — the concurrency ceiling — is a
 * measurement of that specific machine. Replacing it with a default would
 * silently discard the number somebody took the trouble to find.
 *
 * Kept in its own key rather than inside the run record so the report stays
 * readable, and so a killed process can still find it on the next boot.
 */
export const REHEARSAL_PRIOR_CONFIG_KEY = "post_deploy_rehearsal_prior_config";

export class RehearsalRepository {
  static async read(): Promise<RehearsalRun | null> {
    const row = await SystemSettings.findOne({ where: { name: REHEARSAL_SETTING_KEY } });
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.value);
    return rehearsalRunSchema.parse(parsed);
  }

  static async replace(run: RehearsalRun): Promise<void> {
    const validated = rehearsalRunSchema.parse(run);
    await SystemSettings.upsert({ name: REHEARSAL_SETTING_KEY, value: JSON.stringify(validated) });
  }

  /** Remember the configuration the rehearsal is about to overwrite. */
  static async rememberPriorConfig(config: unknown): Promise<void> {
    await SystemSettings.upsert({ name: REHEARSAL_PRIOR_CONFIG_KEY, value: JSON.stringify(config ?? null) });
  }

  static async readPriorConfig(): Promise<unknown | undefined> {
    const row = await SystemSettings.findOne({ where: { name: REHEARSAL_PRIOR_CONFIG_KEY } });
    if (!row) return undefined;
    return JSON.parse(row.value) as unknown;
  }

  static async forgetPriorConfig(): Promise<void> {
    await SystemSettings.destroy({ where: { name: REHEARSAL_PRIOR_CONFIG_KEY } });
  }
}
