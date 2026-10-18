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

## 2026-10-19 遠端整合與安全修補

依已確認的規則語意，本機合併 host `origin/main` 與 desktop `origin/develop`；desktop 原有未提交功能修改保留。合併後分別修補有漏洞的相依版本，以及 host ZIP 匯出檔名、desktop 作答暫存與重新登入後作答復原路徑的目錄跳脫風險。此輪未推送或部署。

驗證：考卷三端與語言兩端 fixture 一致；host backend 74 檔／746 測試、frontend 17 檔／120 測試通過，兩端編譯通過；desktop 型別檢查、39 檔／443 測試及 electron-vite build 通過，另以實際編譯器／runtime 跑 C、Cpp、Python、JavaScript、Java 的 5 個探針案例全通過。安全修補的 ZIP、本機檔名與登入復原測試另行通過。

相依稽核較 2026-10-15 改善：host 全量 88 → 15 項（生產依賴 14 項），desktop 全量 60 → 36 項（生產依賴 6 項）。host 剩餘高／嚴重項目在 `sqlite3` 的 `node-gyp` → `tar` 建置鏈；desktop 生產項目需 Electron 34 → 44 的主要版本升級，尚缺 Windows 包裝與真機驗證。Vitest 主要版本升級試驗造成既有測試失敗、且產生無法以一般 `npm ci` 安裝的 lockfile，已撤回。T179 的全量安全與 100% coverage gate 仍未達成；現場 F2–F4 與舊驗收項目也維持未完成。

## 2026-10-19 非真機驗收補測

本輪在 host `develop` 與 desktop `feat/007-environment-precheck` 工作區驗證，未以真機畫面代替證據。兩端階段型別均為 `UNINITIALIZED / INITIALIZED / SETUP_FINISHED / IN_PROGRESS / FINISHED`；僅註解和刻意拒絕舊值的測試曾提及 `NOT_STARTED`，桌面 preload 的過期註解已更正。`bash scripts/check-contract-fixture.sh` 確認考卷三端及語言兩端 fixture 相同。`pnpm test`：backend 74 檔、749 測試通過；`pnpm --filter frontend typecheck` 與 `pnpm --filter frontend test`：型別通過，17 檔、120 測試通過。desktop `npm run typecheck` 與 `npx vitest run`：型別通過，39 檔、446 測試通過，另有 runtime 預設略過的 5 項（先前以啟用旗標跑過五種真實工具鏈）。`git diff --check` 兩端通過。

新增整合回歸證明：待助教審核的裝置可讀取語言，但 `LoginRequest` 保持 PENDING、無核准通行證，學生裝置與 IP 綁定不變；桌面端已核准註冊後即使預檢回報 FAILED，仍保有已註冊狀態和原 AES key。F3 跨端 GUI 核准走查仍待真機執行。以 60 題完整測資考卷的真實 `POST /user/exam/config` 與 `POST /user/exam/key` 加密 HTTP 回應 JSON 位元組量測，`keyBytes / paperBytes < 0.01` 的整合斷言通過；小型單題 fixture 不代表正式考卷傳輸比例。

完整 src coverage gate 實跑並**失敗**：backend 2303/2638 行（87.30%），frontend 609/2240 行（27.18%），desktop 39.23%。命令分別為 `pnpm --filter backend exec vitest run --coverage --coverage.include='src/**' --coverage.thresholds.lines=100`、frontend 同式，以及 desktop `npx vitest run --coverage --coverage.include='src/**' --coverage.thresholds.lines=100`。desktop 新增的 `exam-languages.schema.ts` 與 `environment-check.guard.ts` 達 100%，但修改中的 `auth.ipc.ts` 98.06%、`api.service.ts` 95.51%、`environment-check.service.ts` 92.85%；既有 renderer 頁面多為 0%。因此 T179 的新增／修改路徑 100% 與全域 CI gate 尚未滿足，不能把測試通過當成覆蓋合格。

三端 production build 均通過：`pnpm --filter backend build`、`pnpm --filter frontend build`、desktop `npm run build`。desktop 另以 `RUN_ENVIRONMENT_CHECK_INTEGRATION=1 npx vitest run test/integration/environment-check.runtime.test.ts` 讓 C、Cpp、Python、JavaScript、Java 的 5 項探針全數實際執行並通過。這是開發機工具鏈測試，仍非 F2–F4 考場真機走查。desktop 本輪配對功能已整理為 `7684649`，host 文件／補測仍在 `develop`。重新執行 audit：host 15 項（含 tar 建置鏈與 Sequelize uuid），desktop 36 項（含需主要版本升級的 Electron／Vitest）；兩端 audit job 仍會失敗。

SC-009 的 desktop judger／special rules／UI 測試全通過，但「既有測試 0 處修改」的字面條件不成立：feature 007 開發及已核准的遠端 special-rules-scoring 合併均曾修改這些測試。這些修改並非本輪為了讓 meta/cipher 切分通過而做；T122 保留未勾選，待以雙方同意的基線重新界定 0 處修改的範圍。T119–T121、T180 的現場走查與正式共同合併尚未完成。

已建立互相引用的草稿 PR：[host #3](https://github.com/Rduanchen/ntut-exam-v2/pull/3) 與 [desktop #6](https://github.com/Rduanchen/NTUT-on-machine-test/pull/6)。兩份描述均註明必須同時合併／部署，並列出 coverage、audit 與真機阻礙；T126 的開 PR 步驟已完成，尚未合併。配對程式版本為 host `90f7069204a4897ea41dce5e2c79483209e8efd9`（後續僅補驗證文件）與 desktop `76846492564d786c838c4f977d9c8fb046df6714`。

PR 建立後的 GitHub checks：host 與 desktop 的 `audit`、`test` 均失敗。這與上述本機全域 coverage／audit gate 結果一致，草稿狀態維持，不視為可合併。

額外輸入邊界修補：環境回報原本只限制最多 20 個失敗語言，現在每個標籤也截為最多 32 字元，避免已註冊裝置回報過長字串進入資料庫。新增整合回歸後重新執行 `pnpm test`：backend 74 檔、750 測試通過，fixture 仍一致。上方 749 為修補前的同日快照；後續以 750 為準。
