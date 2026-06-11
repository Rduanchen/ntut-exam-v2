import { Router, Request, Response } from "express";

const adminSystemInfoRouter = Router();

/**
 * GET /admin/system-info
 * Returns system-level configuration warnings for the admin dashboard.
 */
adminSystemInfoRouter.get("/", (req: Request, res: Response) => {
  const loadTestMode = process.env.LOAD_TEST_MODE || null;

  const warnings: string[] = [];

  if (loadTestMode === 'pure') {
    warnings.push(`⚠️ LOAD_TEST_MODE = "pure"：加密驗證已完全繞過，任何帳號皆可登入，且 IP 可被偽造。請勿在正式考試中使用此模式！`);
  } else if (loadTestMode === 'simulation') {
    warnings.push(`⚠️ LOAD_TEST_MODE = "simulation"：不存在的帳號將被自動建立並允許登入，且 IP 可被偽造。請勿在正式考試中使用此模式！`);
  } else if (loadTestMode === 'true') {
    warnings.push(`⚠️ LOAD_TEST_MODE = "true"：IP 可被偽造。請勿在正式考試中使用此模式！`);
  }

  res.status(200).json({
    loadTestMode: loadTestMode || 'disabled',
    warnings,
  });
});

export default adminSystemInfoRouter;
