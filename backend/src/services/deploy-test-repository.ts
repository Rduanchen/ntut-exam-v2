import { SystemSettings } from "../models/system-settings.model";
import { deploymentTestRunSchema } from "../schemas/deploy-test.schema";
import type { DeploymentTestRun } from "../types/deploy-test.type";

export const DEPLOY_TEST_SETTING_KEY = "judger_deploy_test_latest";

export class DeployTestRepository {
  static async read(): Promise<DeploymentTestRun | null> {
    const row = await SystemSettings.findOne({ where: { name: DEPLOY_TEST_SETTING_KEY } });
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.value);
    return deploymentTestRunSchema.parse(parsed);
  }

  static async replace(run: DeploymentTestRun): Promise<void> {
    const validated = deploymentTestRunSchema.parse(run);
    await SystemSettings.upsert({ name: DEPLOY_TEST_SETTING_KEY, value: JSON.stringify(validated) });
  }
}
