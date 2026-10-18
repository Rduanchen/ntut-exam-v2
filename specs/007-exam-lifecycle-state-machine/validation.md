# 007 環境預檢增量驗證

驗證日期：2026-10-15。功能實作完成，自動功能測試通過；尚未達成正式合併／現場驗收門檻。

## 工作區與基線

| Repo | 工作分支 | 基線 HEAD |
|---|---|---|
| host | feat/007-environment-precheck-plan | 3d80736ccbaa99a9548dbfa8722c69b540406e79 |
| desktop | feat/007-environment-precheck | c505567a644d6b98172530294c65fca5d115d14a |

host 開始實作前已有本功能的規格／計畫／任務文件修改，保留並接續更新。desktop 從乾淨 develop 建立功能分支。未提交、推送或合併；基線版本不代表可部署成品。執行環境：Darwin arm64、Node v24.19.0、pnpm 10.33.4。

## 自動驗證

| 命令／檢查 | 結果 |
|---|---|
| bash scripts/check-contract-fixture.sh | 考卷三端及語言兩端 fixture 完全一致 |
| pnpm --filter backend typecheck:test | 通過 |
| pnpm --filter frontend typecheck | 通過 |
| desktop: npm run typecheck | node/web 皆通過 |
| backend 完整 Vitest（最後含 coverage 的執行） | 71 files、736 tests 通過；coverage gate 另列 |
| pnpm --filter frontend test | 17 files、120 tests 通過 |
| desktop 完整 Vitest（最後含 coverage 的執行） | 36 files、427 tests 通過；runtime 預設 5 skipped，另啟用執行如下 |
| desktop: RUN_ENVIRONMENT_CHECK_INTEGRATION=1 npx vitest run test/integration/environment-check.runtime.test.ts | C、Cpp、Python、JavaScript、Java 共 5 tests 全通過，實際執行 probe/smoke/TLE/MLE；無 skipped |
| git diff --check（兩端） | 通過 |

## 行為證據

- `user-exam-languages.controller.test.ts` 使用真正 RSA 註冊／AES-GCM 封包，涵蓋五階段、無學生登入、canonical 去重排序、空清單、缺／壞設定、壞封包、過期／重播、pure 模式不繞過驗證、冒用其他 UUID、讀取途中 reset／換 key。60 個並行請求全部回 200，解密皆只有 languages。
- `exam-phase.middleware.test.ts` 納入 languages 五階段矩陣；`admin-exam-state.controller.test.ts` 證明 UNKNOWN/RUNNING/FAILED 均不阻擋 SETUP_FINISHED／IN_PROGRESS。
- `environment-precheck.test.ts` 驗證登入前取得、慢請求合併、成功快照不刷新、同快照 retry、失敗重取、空與非法回應、換 key 重檢（包括同樣語言）、reset 後延遲 API／runner／待回報失效，以及完全離線不呼叫 API 或上報。
- `api.service.test.ts` 驗證無 token 可取得、解密 schema、不合法回應拒絕、金鑰變更丟棄舊回應及應用層 success 確認。`auth.ipc.test.ts` 以永不完成的 preparation 驗證註冊仍能成功返回；既有核准、待審、登入及作答恢復回歸均通過。
- config 測試確認線上密文取得後 examConfig 仍 null 且不啟動 applyMeta；既有離線檔案與口令開考測試通過。connection 測試確認恢復連線會呼叫取得重試及回報重送；message-sync reset 測試確認先取消環境工作才清 RAM。
- 環境回報整合測試驗證序號 2 PASSED 後，序號 1 RUNNING 或重複 2 FAILED 不覆寫；同 UUID 重新註冊後，已驗證的舊 key 原子寫入被拒絕。非法／缺少 sequence 回 400。
- readiness 整合測試實際跑 INITIALIZED → FAILED report → SETUP_FINISHED → login → FAILED 保留 → PASSED report → ready=true。未綁學生顯示 UNKNOWN，不猜配裝置。前端既有測試確認已登入學生仍顯示 FAILED 語言、RUNNING／UNKNOWN 不算通過。
- `environment-sequence-migration.test.ts` 刪除舊資料表的 sequence 欄位後執行兩次 initDatabase；確認欄位補為 0、原裝置 PASSED 保留。未新增套件，沒有改動 lockfile。

## 全專案 coverage 與安全 gate

coverage 使用 `vitest run --coverage --coverage.include='src/**'`，避免僅測原本 deploy/rehearsal 子集即宣稱全專案合格。

| Repo | Lines | 判定 |
|---|---|---|
| backend | 2285 / 2625 = 87.04% | 未達 100%；命令退出 1 |
| frontend | 610 / 2240 = 27.23% | 未達 100%；命令退出 1 |
| desktop | 3678 / 9416 = 39.06% | 未達 100%；本機原設定未設 threshold，不能把 exit 0 當作覆蓋合格 |

`pnpm audit --audit-level high`：88 項（2 low、38 moderate、46 high、2 critical）。desktop `npm audit --audit-level=high`：60 項（2 low、11 moderate、43 high、4 critical）。兩者均未通過。這是現有 lockfile 的實際結果，本增量未修改相依版本；不宣稱已完成安全修復。

兩端新增 `.github/workflows/quality.yml`，以獨立 audit job 執行稽核，test job 明確要求 src/** 的 100% 行覆蓋。CI 尚未在 GitHub 執行；依本機數據預期 gate 會失敗，不能合併。host CI 沒有 desktop checkout 時明示 SKIP_DESKTOP，配對部署仍需本機／整合環境執行雙 repo fixture 檢查。

## 尚未完成

- T178 的現場 F3 核准入場走查；自動核准／待審／登入回歸已通過，但不能替代桌面 GUI 與管理端連動驗收。
- T179 的全專案 100% 行覆蓋，以及安全相依修復；不得降低門檻或只縮小統計範圍宣告完成。
- T180 的跨端真機 F2–F4 與受影響 B/C/D：實際拔網路、後端關閉的離線開考、重啟、跨端畫面與已提交作答保存。上述本機五語言 runtime 測試不是此現場驗收。
- T181 文件、部署配對說明已更新，但正式驗收依賴尚未完成，保持未勾選。舊 T117–T126 維持原狀，不冒認完成。

無 `.specify/extensions.yml`，無 before/after implement hooks 需執行。

## 2026-10-15 現場問題修復：語言端點 phase_not_allowed

14:36 確認執行中的後端為 `node dist/index.js`，舊 dist 未包含 languages 路由與 phase rule。現場 GET status 為 SETUP_FINISHED，但 POST languages 回 phase_not_allowed；目前原始碼允許此階段，因此定位為未重新編譯的執行產物。重新 build 並重啟後，空封包改回正確的 invalid_language_request。原桌面版自動重連，14:37 已回報 PASSED，failedLanguages 為空，sequence=6；考試仍為 SETUP_FINISHED，沒有 reset。

修正 backend/package.json 的 start 為先 pnpm run build 再啟動 dist，並以該指令實際啟動驗證。此觀察補充線上預檢現場證據，不代表已完成所有離線／拔線／核准入場驗收。
