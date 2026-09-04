# 後端功能人工驗收清單 (Backend Manual Verification List)

本清單以 **後端 (`backend/`)** 為對象，逐一列出目前實作出來的每一個功能，供部署後由人工手動確認「wishlist（各 feature spec 的驗收條件與 vision 的里程碑）是否真的被達成」。

- 適用範圍：`backend/src/` 全部 routes / controllers / services / middlewares / sockets / config。
- 與 `test-checklist.md` 的差異：那份是「Host + Desktop 端到端操作」的部署清單；**這份是後端功能面的完整盤點**，每一項都對應到實際存在的程式進入點。
- 驗證方式代號：`API` = 直接打 HTTP 端點（curl / Postman）、`UI` = 透過管理前端、`CLI` = 觀察終端機/log、`DB` = 檢查 SQLite 內容、`E2E` = 需搭配 Desktop 客戶端。
- 所有 `/admin/*` 端點都需帶 `Authorization: Bearer <ADMIN_TOKEN>` 或 `x-admin-token`。

---

## 0. 前置環境 (Preconditions)

- [ ] `CLI` 後端啟動成功，`Server is running on http://localhost:<PORT>`，無 error log。
- [ ] `CLI` 啟動時 `initDatabase()` 正常，首次啟動能自動建立 `ntut-exam.sqlite` 與所有資料表。
- [ ] `CLI` 啟動時 `checkPistonServer()` 有回報 Piston 可達；Piston 關閉時啟動流程給出明確錯誤而非無聲失敗。
- [ ] `CLI` `.env` 未設 `LOAD_TEST_MODE` 時，終端機**沒有**紅底警告（正式考試必須是這個狀態）。
- [ ] `CLI` 分別設 `LOAD_TEST_MODE=true / simulation / pure`，確認三種紅底警告文字各自正確出現。

---

## 1. 系統初始化與考卷設定 (Init & Exam Config)

`admin-init.route.ts` / `admin-config.route.ts` / `exam-config.service.ts` / `schemas/config.schema.ts`

- [ ] `API` `GET /admin/init/init-status` — 未初始化時回報未初始化，初始化後狀態改變。
- [ ] `API` `POST /admin/init` — 執行 `InitService.performInitialization()`，依考卷 `accessibleUsers` 建立使用者。
- [ ] `API` `POST /admin/init/reset` — `wipeAllData()` 清空全部資料（提交、分數、log、綁定），且系統仍可再次初始化。
- [ ] `API` `POST /admin/config` — 上傳完整考卷 JSON，確認是**整份覆寫而非合併**（對應 knowledge/history「考卷即機器完整設定」）。
- [ ] `API` `GET /admin/config` — 讀回的設定與上傳內容一致。
- [ ] `API` `PUT /admin/config` — `restrictedUpdate()` 只允許受限欄位更新，非法欄位被拒。
- [ ] `API` 上傳缺少 `environmentVariables.startPassword` 的考卷 → 400 且錯誤訊息指出欄位。
- [ ] `API` 上傳含未支援語言 / 分數為負 / 缺 `subtasks` 的考卷 → zod 驗證失敗並回傳可讀錯誤。
- [ ] `DB` 考卷儲存在 `system_settings`，重啟後仍在（`SystemSettingsService.getExamConfig`）。
- [ ] `API` 考卷含 `sections → puzzles → subtasks → visible/hidden testcases` 的巢狀結構能完整存取（`exam-config-parser.service`：`getPuzzleById`、`questionExists`）。

---

## 2. 考試狀態機 (Exam State)

`admin-exam-state.route.ts` / `exam-state.service.ts`

- [ ] `API` `GET /admin/exam-state` — 未設定時回 `UNINITIALIZED`。
- [ ] `API` `POST /admin/exam-state` 依序切換 `NOT_STARTED → IN_PROGRESS → FINISHED`，每次都成功寫入。
- [ ] `API` 重複送出相同狀態 → 不重複廣播、不產生多餘 message 紀錄。
- [ ] `API` 切到 `IN_PROGRESS` 時，**裝置註冊自動關閉**（`allowDeviceRegistration` 變 false）—— 這是防作弊關鍵，務必確認。
- [ ] `E2E` 每次狀態變更都會產生一筆 `EXAM` 類型 message 並經 `/user` socket 廣播，Desktop 端即時反應。
- [ ] `API` `GET /user/exam/status` — 學生端可查得目前狀態。

---

## 3. 加密握手與登入 (Crypto Handshake & Auth)

`user-auth.route.ts` / `crypto.service.ts` / `device.service.ts` / `auth.service.ts` / `replay-protection.service.ts` / `user-crypto.middleware.ts`

- [ ] `API` `GET /user/auth/rsa-public-key` — 回傳合法 RSA public key，且**私鑰絕不外洩於任何回應**。
- [ ] `API` `POST /user/auth/register-device` — 以 RSA 加密的 AES key 註冊裝置，回應成功並存下 device key。
- [ ] `API` 當 `allowDeviceRegistration = false` 時再次註冊新裝置 → 被拒絕。
- [ ] `API` `POST /user/auth/login` — AES-GCM 加密的憑證登入成功，回傳 session token。
- [ ] `API` 錯誤密碼 / 不存在學號 → 登入失敗且不洩漏帳號是否存在的差異訊息。
- [ ] `API` `GET /user/auth/student-id` — 依來源 IP 回傳對應學號（auto-login 輔助），IP 未綁定時回空。
- [ ] `API` 竄改 GCM authTag 或密文 → `decryptAndVerifyDeviceSession` 拒絕（非 500 未捕捉錯誤）。
- [ ] `API` **重放攻擊**：同一 nonce 重送第二次 → 被 `ReplayProtectionService` 拒絕。
- [ ] `API` **時間漂移**：timestamp 超過允許漂移（預設 10s）→ 被拒絕。
- [ ] `API` 使用他人 device_uuid 的 session token → 驗證失敗。
- [ ] `API` session token 過期 / 簽章不符 → 401 且錯誤結構一致。

---

## 4. 裝置綁定與 TA 審核 (Device Binding & Approval)

`binding.service.ts` / `connection.route.ts` / `admin-security.route.ts`

- [ ] `API` 學生首次登入 → 裝置與 IP 綁定成功（`bindDeviceToUser`）。
- [ ] `API` **同帳號換裝置登入** → 進入「需審核 (approval required)」狀態，登入被拒（spec 001 US3 驗收 1）。
- [ ] `API` `GET /admin/connection/requests` — 上述請求出現在待審清單。
- [ ] `API` `POST /admin/connection/requests/:id/approve` — 核准後學生可登入，且**舊 IP 被清除**（spec 001 US3 驗收 2）。
- [ ] `API` `POST /admin/connection/requests/:id/reject` — 拒絕後學生仍無法登入。
- [ ] `API` `POST /admin/connection/unblock` — 手動解除封鎖生效。
- [ ] `API` `GET /admin/connection/devices` — 列出所有裝置與其連線狀態。
- [ ] `API` `POST /admin/connection/devices/:uuid/unbind` — 解除綁定後該裝置可重新綁定。
- [ ] `API` `DELETE /admin/connection/devices/:uuid` — 取消註冊後該裝置需重新 register-device。
- [ ] `API` `GET/POST /admin/connection/settings` — 開關 `allowRegistration` 並確認即時生效。
- [ ] `API` `GET /admin/device` — 裝置連線總覽正確。
- [ ] `API` `DELETE /admin/device/:deviceUuid` — 需 `RESET_DEVICE` 權限；刪除金鑰後該裝置無法再解密。
- [ ] `API` `PUT /admin/users/:testId/reset-device` — 需 `RESET_BINDING` 權限；重設後學生可在新機登入。
- [ ] `E2E` `forceLogoutDevice()` — 被強制登出的裝置端有收到通知並回到登入畫面。

---

## 5. 管理端授權 (Admin Authorization)

`middlewares/admin.middleware.ts`

- [ ] `API` 不帶 token 打任一 `/admin/*` → 401。
- [ ] `API` 帶錯誤 token → 401，且訊息不洩漏正確 token。
- [ ] `API` `Authorization: Bearer <token>` 與 `x-admin-token` 兩種方式皆可通過。
- [ ] `API` `requirePermission("RESET_DEVICE" / "RESET_BINDING")` 在權限不足時回 403（目前 `SUPER_ADMIN` 一律放行，需確認這是預期行為）。
- [ ] `CLI` 未設定 `ADMIN_TOKEN` 環境變數時退回預設 `admin-secret` —— **確認正式部署一定有覆寫**。

---

## 6. 程式碼提交與儲存 (Submission & Code Storage)

`user-submission.route.ts` / `admin-submission.route.ts` / `code-storage.service.ts`

- [ ] `API` `POST /user/submissions/code` — 加密提交程式碼成功，並寫入 `SUBMIT_CODE` action log。
- [ ] `API` 同一題重複提交 → `upsertSubmission` 更新而非累積髒資料。
- [ ] `API` `POST /user/submissions/score` — 分數提交寫入並產生 `SUBMIT_SCORE` log。
- [ ] `API` `GET /user/submissions/codes` — 學生只能取回**自己**的提交（跨學號存取必須失敗，spec 001 核心）。
- [ ] `API` 考試狀態非 `IN_PROGRESS` 時提交 → 依設計拒絕或標記（確認實際行為與期望一致）。
- [ ] `API` `GET /admin/submissions/students` — 列出所有已提交學生。
- [ ] `API` `GET /admin/submissions/:testId/list` — 該生已提交題目清單。
- [ ] `API` `GET /admin/submissions/:testId/code` — 取得原始碼內容正確、編碼無亂碼（含中文註解）。
- [ ] `API` `GET /admin/submissions/:testId/export` — 下載 ZIP，解壓後檔名/內容正確。
- [ ] `API` `POST /admin/submissions/:testId/code` — TA 代為上傳程式碼成功。
- [ ] `API` `DELETE /admin/submissions/:testId/code` — 刪除指定題目 / 全部提交，且不影響其他學生。
- [ ] `API` 提交超大原始碼（數 MB）→ 有界限處理，不會拖垮伺服器。

---

## 7. 評測核心 (Judging Core) — features 003 / 004 wishlist

`judger.service.ts` / `judge-execution.service.ts` / `judge-queue.service.ts` / `judge-limiter.ts` / `judge-startup.service.ts` / `utils/judger-output.util.ts`

### 7.1 基本評測正確性
- [ ] `API` `POST /admin/judger/judge/:testId` — 接受評測並**立即回傳 job handle（不阻塞等待）**（spec 004 US3）。
- [ ] `API` `GET /admin/judger/jobs/:jobId` — 可追蹤 pending → running → done 的狀態轉換。
- [ ] `API` `POST /admin/judger/rejudge` — 以 body 指定對象重新評測（此路由過去回 404，需特別確認已修復）。
- [ ] `API` 正確解答 → AC 與滿分。
- [ ] `API` 錯誤輸出 → WA 與正確的部分分數（subtask 級距）。
- [ ] `API` 真正的語法錯誤 → CE，**且不重試**（spec 004 US1 驗收 3）。
- [ ] `API` 無窮迴圈 → TLE；除以零 / 空指標 → RE。
- [ ] `API` `compareMode: strict` 與 `loose` 兩種比對模式行為差異正確（尾端空白、換行）。

### 7.2 失敗歸因隔離 (Fault Attribution) — 本專案 Root Principle
- [ ] `API` 讓 Piston 過載造成編譯階段被 SIGKILL → 判為 **SYSTEM 失敗而非 CE**（spec 003 US1 / spec 004 US1 驗收 1）。
- [ ] `API` 系統失敗會**自動重試**，重試次數受 `maxSystemRetries` 限制。
- [ ] `API` 重試耗盡後 → 記為系統失敗、**不計分、也不算答錯**（spec 004 US1 驗收 2）。
- [ ] `API` **關掉 Piston** 後評測 → 產生系統失敗 verdict，而不是未捕捉的例外（spec 004 US1 驗收 5）。
- [ ] `API` 學生程式輸出含「memory」等關鍵字 → **不能**因此被誤判為 MLE（spec 003 US3：提交不得偽造系統狀態）。
- [ ] `API` 無限輸出的程式 → 輸出被截斷到上限、系統不凍結（spec 001 US2）。
- [ ] `CLI` 評測過程**不得**把學生原始碼 / 輸出印到 stdout（spec 003 US2 驗收 2）。

### 7.3 併發上限 (Concurrency Ceiling)
- [ ] `API` 同時送出遠超上限的評測 → 實際 in-flight 數**永不超過** `maxConcurrentJobs`（spec 004 US2 驗收 1）。
- [ ] `API` 多個獨立評測請求同時到達 → 上限是**全域共用**而非每請求各自計算（驗收 2）。
- [ ] `API` 等待中的工作在容量釋放後會繼續完成，不會餓死（驗收 3）。
- [ ] `API` 調整上限後**無需重啟**即生效（驗收 4）。
- [ ] `API` 觀察 `peakInFlightCount()` 確認量測的是尖峰而非平均。

### 7.4 崩潰復原
- [ ] `CLI` 評測進行到一半強制 kill 後端 → 重啟時 `JudgeStartupService.recoverInterruptedJudging()` 修復卡在「評測中」的提交。
- [ ] `CLI` 舊格式狀態經 `normaliseLegacyStatuses()` 遷移，啟動 log 有回報 recovered / migrated 數量。

---

## 8. 評測設定與健康檢查 (Judge Settings & Health) — feature 005 wishlist

`admin-judger.controller.ts` / `config/judge.config.ts`

- [ ] `API` `GET /admin/judger/settings` — 每個值都帶**來源標示**（考卷設定 / 預設值 / 環境變數 / 被夾限）（spec 005 US2）。
- [ ] `API` `PUT /admin/judger/settings` — 修改 `compileTimeout`、`compileMemoryLimit`、`maxConcurrentJobs`、`maxSystemRetries` 後立即生效、**免重啟**（US3）。
- [ ] `API` 設定超出範圍（如 `maxConcurrentJobs = 999`，允許 1–64）→ 明確回報**被拒絕**並顯示實際生效值，而非默默接受（US2 驗收 2）。
- [ ] `API` `compileTimeout` 範圍 1000–300000 邊界值測試（min、max、min-1、max+1）。
- [ ] `API` 環境變數 `JUDGE_COMPILE_TIMEOUT_MS` / `JUDGE_MAX_CONCURRENT_JOBS` 覆寫行為與優先序正確。
- [ ] `API` `GET /admin/judger/health` — 回報 Piston 是否可達，以及**實際安裝的語言與版本清單**（US1 驗收 1）。
- [ ] `API` 考卷需要的語言 Piston 沒有 → 明確指出**缺哪個語言**（US1 驗收 2）。
- [ ] `API` Piston 關閉時 → health 回報「不可達」作為一個狀態，而非拋錯（US1 驗收 3）。
- [ ] `API` 重新呼叫 health 可取得刷新後結果，無需重啟（US1 驗收 4）。
- [ ] `UI` 上述全部能在評測設定頁上看到（feature 005 的重點：能力必須可觸及）。

---

## 9. 部署壓測 (Deploy Test) — feature 006 wishlist

`admin-deploy-test.controller.ts` / `deploy-test.service.ts` / `deploy-test-repository.ts` / `deploy-test-metrics.ts` / `deploy-test-startup.service.ts` / `judging-work-coordinator.ts`

### 9.1 執行與追蹤
- [ ] `API` `GET /admin/judger/deploy-tests/profile` — 回傳預設 profile：phases `smoke/verdict/concurrency`、語言 `c/cpp/python`、`jobCount 100`、`deadlineMs 900000`、併發階梯依當前 ceiling 計算。
- [ ] `API` `POST /admin/judger/deploy-tests` — 啟動測試並立即回傳 run 資訊（US1 驗收 1）。
- [ ] `API` `GET /admin/judger/deploy-tests/:runId` — 顯示 state、開始時間、目前 phase、completed/total work（US1 驗收 2）。
- [ ] `API` `GET /admin/judger/deploy-tests/latest` — 取得最近一次結果與完整報告（US1 驗收 3）。
- [ ] `API` 無法啟動時 → 回傳明確原因，且**不建立半成品 run**（US1 驗收 4）。
- [ ] `UI` 以上流程全部在既有 Judge 頁面內完成，不需離開頁面或用命令列。

### 9.2 語言 smoke 測試
- [ ] `API` C / C++ / Python **各自**跑完確定性 I/O 程式（輸出 `42`）並各有獨立結果（US2 驗收 1）。
- [ ] `API` 缺某語言 runtime → 該語言標為 `blocked` 並**指名缺哪個 runtime**，其他語言仍照跑（US2 驗收 2）。
- [ ] `API` 語言有被 advertise 但實際跑不起來 → 標為 `failed` 而非 available（US2 驗收 3）。
- [ ] `API` 每個 probe 結果都含：預期 verdict、實際 verdict、attribution、耗時、**有長度上限的診斷訊息**（5000 字元）（US2 驗收 4）。

### 9.3 verdict 與安全上限
- [ ] `API` `verdict-ce`（`int main( {`）→ CE / SUBMISSION。
- [ ] `API` `verdict-re`（空指標寫入）→ RE / SUBMISSION。
- [ ] `API` `verdict-tle`（無窮迴圈，run_timeout 250ms）→ TLE / SUBMISSION。
- [ ] `API` `verdict-mle`（配置 256MB，限制 32MB）→ MLE / SUBMISSION。
- [ ] `API` `verdict-ole`（無限 puts）→ OLE / SUBMISSION。
- [ ] `API` 報告能**清楚區分「預期中的學生端失敗」與「基礎設施失敗」**（US3 核心）。

### 9.4 併發階段與資源隔離
- [ ] `API` 併發階段依 `concurrencyLevels` 分配 jobs（`distributeJobs`），各階梯的 P50/P95/P99 延遲有統計出來（`nearestRank` / `distribution`）。
- [ ] `API` 測試期間 in-flight 不超過該階梯設定值。
- [ ] `API` 錯誤樣本數受 `DEPLOY_TEST_ERROR_SAMPLE_LIMIT`（10）限制，不會塞爆回應。
- [ ] `DB` **壓測絕不動到學生資料**：跑完確認 submissions / scores / 評測歷史完全未變（feature 006 硬性要求）。

### 9.5 進入條件與互斥 (Admission Control)
逐一觸發並確認 `blockedReason` 正確：
- [ ] `API` 考試進行中啟動壓測 → `exam_in_progress`。
- [ ] `API` 有學生評測進行中 → `student_judging_active`。
- [ ] `API` 已有壓測在跑 → `deploy_test_active`。
- [ ] `API` 壓測收尾中 → `deploy_test_draining`。
- [ ] `API` Piston 不可達 → `piston_unreachable`。
- [ ] `API` 壓測進行中有學生提交評測 → 學生工作優先，壓測進入 draining（`JudgingWorkCoordinator`）。
- [ ] `API` 超過 `deadlineMs` → 測試被中止並標記逾時，而不是永遠掛著。
- [ ] `CLI` 壓測執行中 kill 後端 → 重啟時 `DeployTestStartupService.run()` 把殘留的 run 標成中斷狀態，不會永遠顯示 running。
- [ ] `API` 邊界值：`concurrency` 1–64、`jobs` 1–500、`deadline` 60s–1800s、`levels` ≤ 8，超出即拒絕。

---

## 10. 成績計算 (Scoring)

`judger.service.ts::syncScoreBoard` / `admin-score.route.ts` / `special-rules/`

- [ ] `API` `GET /admin/scores` — 列出全部學生成績，含各題明細與總分。
- [ ] `API` 分數為各 subtask 得分加總，且不超過該題 `score` 上限。
- [ ] `API` 重新評測後成績正確覆蓋，不會出現舊分數殘留。
- [ ] `API` 系統失敗的提交**不影響分數**（不加分也不歸零覆蓋既有成績）。
- [ ] `API` 特殊規則 `regex` / `use` / `composite` / `nestedLoop` 各觸發一次，確認 `multiplier`（0–1）正確乘算。
- [ ] `API` `MUST_HAVE` 與 `MUST_NOT_HAVE` 兩種 constraint 行為相反且皆正確。
- [ ] `API` `globalSpecialRules` 與 puzzle 層 `specialRules` **同時存在時的套用順序**：先 global 後 puzzle（`getEffectiveSpecialRules`）。
- [ ] `API` `severity: info` 與 `warn` 的訊息都有回傳給前端顯示。

---

## 11. 防作弊 (Anti-Cheat)

`anti-cheat.service.ts` / `admin-anticheat.route.ts`

- [ ] `API` 客戶端上報 `alert`（如 `APP_ON_QUIT`、切換視窗）→ 產生 violation 紀錄。
- [ ] `API` **同一使用者從不同 IP** 出現 → 記錄 `MULTIPLE_IPS` violation。
- [ ] `API` **同一 IP 出現不同使用者** → 記錄對應 violation。
- [ ] `API` violation 產生時透過 `/admin` socket 即時推播告警（`triggerAlert`）。
- [ ] `API` `GET /admin/anticheat/logs` — 全部告警列表。
- [ ] `API` `GET /admin/anticheat/logs/:studentID` — 單一學生告警。
- [ ] `API` `PUT /admin/anticheat/status` — TA 標記告警為「已確認 (isOk)」並持久化。
- [ ] `API` 大量告警湧入時不阻塞主流程（`checkUserAction` 的錯誤被吞掉不影響請求）。

---

## 12. 日誌 (Logging)

`user-log.route.ts` / `admin-log.route.ts` / `user-action-log.service.ts` / `action-log.middleware.ts`

- [ ] `API` `POST /user/log` — 加密上報客戶端行為，寫入 `user_action_logs`。
- [ ] `API` `GET /admin/log` — 全部行為紀錄，含 testId、IP、actionType、timestamp。
- [ ] `API` `GET /admin/log/:testId` — 單一學生紀錄。
- [ ] `API` `createActionLog('SUBMIT_CODE' / 'SUBMIT_SCORE')` middleware 在提交時自動落 log。
- [ ] `DB` IP 經 `normalizeIp` 正規化（IPv6-mapped IPv4 不會出現兩種格式而誤觸 `MULTIPLE_IPS`）。
- [ ] `CLI` `logger.util` 的 info/warn/error 分級輸出正常，檔案 log 有落地。

---

## 13. 訊息與 Socket 廣播 (Messaging & Sockets)

`admin-message.route.ts` / `message.service.ts` / `sockets/*`

- [ ] `API` `POST /admin/messages` — 廣播公告，所有已連線 `/user` socket 收到。
- [ ] `E2E` `/user` namespace 的 `register` 事件把 socket 與 testId 對應起來。
- [ ] `E2E` 針對單一學生的 `exam-message` 只送達該學生。
- [ ] `E2E` `disconnect` 後 Host 端能標記該裝置離線。
- [ ] `API` `POST /user/exam/messages` — **離線期間漏收的訊息**在重連後能補齊（`getMessagesAfterId`）。
- [ ] `API` `getLatestMessageVersion` / `getLatestConfigVersion` — 版本號遞增正確，客戶端可據此判斷是否需要重抓。
- [ ] `E2E` `/admin` namespace 連線後能收到 violation / 狀態變更等即時事件。

---

## 14. 安全考卷傳遞 (Secure Config Delivery)

`user-exam.route.ts` / `exam.service.ts`

- [ ] `API` `POST /user/exam/config` — 回應是 **AES-GCM 加密**的考卷，明文不出現在網路上。
- [ ] `API` 回傳的考卷**不含 hidden 測資的答案**（若設計如此，需明確確認學生端拿不到隱藏測資）。
- [ ] `API` 未通過 `decryptAndVerifyDeviceSession` 的請求無法取得考卷。
- [ ] `API` 未登入 / 未綁定的裝置請求考卷 → 拒絕。
- [ ] `API` 考試尚未開始時請求考卷 → 依設計拒絕或回傳受限內容（確認行為一致）。

---

## 15. 系統資訊與負載測試模式 (System Info & Load Test Mode)

`admin-system-info.route.ts` / `load-test-ip-mock.middleware.ts`

- [ ] `API` `GET /admin/system-info` — 正常模式回 `loadTestMode: "disabled"`、`warnings: []`。
- [ ] `API` `LOAD_TEST_MODE=pure` → warning 指出「加密驗證完全繞過、任何帳號皆可登入、IP 可偽造」。
- [ ] `API` `LOAD_TEST_MODE=simulation` → warning 指出「不存在帳號會被自動建立」。
- [ ] `API` `LOAD_TEST_MODE=true` → warning 指出「IP 可偽造」。
- [ ] `API` 三種模式下 `loadTestIpMockMiddleware` 確實依 header 覆寫來源 IP。
- [ ] `API` **關閉 LOAD_TEST_MODE 後，偽造 IP 的 header 完全無效** —— 這是正式考試的安全底線，必須實測。
- [ ] `UI` 管理介面有把上述 warning 顯眼地呈現出來。

---

## 16. 錯誤處理與韌性 (Error Handling & Resilience)

- [ ] `API` 所有錯誤都經全域 error handler，回傳一致的 JSON 結構（`HttpError`），不洩漏 stack trace。
- [ ] `API` 不存在的路由 → 404 而非 HTML 錯誤頁。
- [ ] `API` 惡意 payload（超長字串、巢狀 JSON、null 注入）不造成 500 未捕捉錯誤。
- [ ] `API` SQLite 鎖定 / 併發寫入時的行為可接受，不會整個服務卡死。
- [ ] `CLI` 任何單一學生的評測失敗不會中斷其他學生的評測。
- [ ] `CLI` 長時間運行（模擬整場考試時長）後無記憶體洩漏、socket 連線數穩定。

---

## 17. Wishlist 對照總表 (Wishlist Coverage)

逐項確認 spec 的核心承諾在**部署環境**上真的成立：

| 來源 | 承諾 | 確認 |
|---|---|---|
| spec 001 | 測資與系統機密完全隔離於評測沙箱外，惡意程式讀不到、改不到 | [ ] |
| spec 001 | 超大輸出被截斷，系統不凍結 | [ ] |
| spec 001 | 換裝置登入需 TA 核准，核准後舊 IP 清除 | [ ] |
| spec 002 | 後端 16 services + 13 controllers 皆有測試，`pnpm test` 全綠 | [ ] |
| spec 003 | 編譯階段被 SIGKILL 不再被誤判為 CE | [ ] |
| spec 003 | 套件 import 時不發網路請求、不印提交內容 | [ ] |
| spec 003 | 學生輸出無法偽造系統狀態（MLE 誤判） | [ ] |
| spec 004 | 系統失敗會重試、不計分、不算答錯；真 CE 不重試 | [ ] |
| spec 004 | 全域併發上限生效，且改設定免重啟 | [ ] |
| spec 004 | 評測非同步化，請求不會因排隊而 timeout | [ ] |
| spec 005 | 每個設定值都看得到來源；越界值顯示為被拒絕 | [ ] |
| spec 005 | 考前一眼看出 Piston 是否可達、缺哪個語言 | [ ] |
| spec 005 | 不改檔、不重啟即可調參 | [ ] |
| spec 006 | 壓測可在 Judge 頁面內完成啟動與看結果 | [ ] |
| spec 006 | C/C++/Python 實際跑得起來（不只是被 advertise） | [ ] |
| spec 006 | CE/RE/TLE/MLE/OLE 分類正確，且區分學生失敗與基礎設施失敗 | [ ] |
| spec 006 | 壓測不動到 submissions / scores / 評測歷史 | [ ] |
| vision | 高併發下系統穩定不崩潰（併發 20 CE 率 0%） | [ ] |
| vision | ⚠️ **已知未達成**：測資重複編譯尚未消除，評測速度未改善（僅負載變可承受） | [ ] 確認此限制仍被接受 |

---

## 18. 尚未納入自動測試的區塊（人工驗證權重最高）

vision 明確指出以下區塊沒有測試覆蓋，因此**只能靠人工確認**：

- [ ] `backend/src/sockets/` — 全部 socket 行為。
- [ ] `backend/src/middlewares/` — 加密、admin 授權、action log、load-test IP mock。
- [ ] `backend/src/utils/` — `ip.util`、`judger-output.util`、`logger.util`、`init-db.util`。
- [ ] 前端除「評測設定頁」以外的所有頁面與後端的整合。
