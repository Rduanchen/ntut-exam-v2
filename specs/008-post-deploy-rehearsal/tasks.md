---
description: "Task list for feature 008 — Post-Deployment Rehearsal"
---

# Tasks: Post-Deployment Rehearsal (部署後測試)

**Input**: Design documents from `/specs/008-post-deploy-rehearsal/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 強制。憲法第 VI 條要求 100% 行覆蓋，且 spec.md 的 NFR 全部需要可執行的證明。

**Organization**: 依 user story 分階段。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、無未完成相依）
- **[Story]**: 對應 spec.md 的 user story

## Path Conventions

Web app 雙專案：`backend/src/`、`backend/test/`、`frontend/src/`。

---

## ⚠️ 階段順序與 spec.md 的優先序不同 —— 理由

spec.md 有五個 P1，其間的先後由本檔決定。採用的順序是 **US5 → US1 → US4 → US2 → US3 → US6**，理由：

1. **US5（不會誤刪正式考卷）排第一**，因為它是唯一一個「先寫才安全」的故事。在准入閘門存在之前，任何能跑的演練程式碼都是一顆隨時會清空正式考卷的地雷。它自己不產生價值，但它讓後面每一階段都能安全地在真實機器上被試。
2. **US1 的 MVP 只含第 1 段與第 6 段**（載入考卷 → 初始化 → 清除）。這已經是可交付的東西：它證明 config → init → reset 這一圈走得通，而那是整條鏈的兩端。中間四段此時為 `skipped`。
3. **US4 緊接在 US1 之後**，因為 US1 帶來了第一份「會留下真實資料的背景工作」，重啟復原與清除失敗的警示必須在那之後立刻補上，不能欠著。

---

## Phase 1: Setup

**Purpose**: 分支與骨架

- [X] T001 從 `develop` 建立分支 `feat/008-post-deploy-rehearsal`（憲法第 III 條；host 與 desktop 各自獨立，本功能只動 host）
- [X] T002 [P] 建立空檔骨架 `backend/src/schemas/rehearsal.schema.ts`、`backend/src/types/rehearsal.type.ts`、`backend/src/services/rehearsal-repository.ts`、`backend/src/services/rehearsal.service.ts`、`backend/src/services/rehearsal-client.ts`、`backend/src/services/rehearsal-startup.service.ts`、`backend/src/controllers/admin/admin-rehearsal.controller.ts`、`backend/src/routes/admin/admin-rehearsal.route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共用的型別、考卷、持久化與互斥機制

**⚠️ CRITICAL**: 本階段未完成前，任何 user story 都不能開始

### Tests (MANDATORY)

- [X] T003 [P] `backend/test/unit/schemas/rehearsal.schema.test.ts`：驗證 run/stage/check 的 schema 接受合法值、拒絕非法值，並驗證 data-model.md §1 的不變式（`stages` 恆為 6 段且 id 不重複、終態必有 `overallOutcome` 與 `finishedAt`）
- [X] T004 [P] `backend/test/unit/config/rehearsal-paper.config.test.ts`：驗證演練考卷通過 `examConfigSchema.parse`、`accessibleUsers` **不含 `ip`**（research.md D3）、含 `rehearsal-ac` 與 `rehearsal-wa` 兩題、`startPassword` 非空、且**未覆寫 `maxConcurrentJobs`**
- [X] T005 [P] `backend/test/unit/services/rehearsal-repository.test.ts`：讀寫往返、只保留最近一次、讀取時 parse 失敗會拋出
- [X] T006 [P] `backend/test/unit/services/judging-work-coordinator.test.ts`（修改既有檔）：rehearsal 擋 deploy、deploy 擋 rehearsal、rehearsal **不**擋 student、lease 釋放後恢復（research.md D4）

### Implementation

- [X] T007 [P] 在 `backend/src/schemas/rehearsal.schema.ts` 定義 `rehearsalCheckSchema`、`rehearsalStageSchema`、`rehearsalRunSchema`、`rehearsalStartInputSchema`（含 `acknowledgeWipe` 必為 `true`），依 data-model.md §1–§3
- [X] T008 [P] 在 `backend/src/types/rehearsal.type.ts` 以 `z.infer` 推導型別，並實作 `isTerminalRehearsalState()`（終態集合 `completed`/`interrupted`/`failed`，與 deploy-test 同形）
- [X] T009 [P] 建立 `backend/src/config/rehearsal-paper.config.ts`：以 **production 的 `ExamConfig` 型別標註**並於模組載入時 `examConfigSchema.parse()`，另匯出兩份提交程式碼常數（一份必然 AC、一份必然 WA），依 data-model.md §5
- [X] T010 在 `backend/src/services/rehearsal-repository.ts` 實作 `read()` / `replace()`，存於 `SystemSettings` key `post_deploy_rehearsal_latest`，讀寫兩端皆 parse（research.md D5）
- [X] T011 在 `backend/src/services/judging-work-coordinator.ts` 新增 `acquireRehearsal()` 與 `rehearsal` 狀態；`acquireDeploy()` 加上 `rehearsal_active` 拒絕理由；**`acquireStudent()` 維持不變**（research.md D4 —— 這是演練能走完評測段的唯一原因，改它就等於讓演練自己卡死自己）

**Checkpoint**: 型別、考卷、持久化、互斥就緒

---

## Phase 3: User Story 5 - 不會誤刪正式考卷 (Priority: P1) 🛡️ 先於一切

**Goal**: 演練的准入閘門存在且正確拒絕，端點可被呼叫但**還不會變更任何資料**

**Independent Test**: 在已初始化並上傳考卷的系統上呼叫啟動端點，確認被 `409` 拒絕、考卷與資料 0 筆變更；在乾淨系統上確認 `canStart: true`

### Tests (MANDATORY) ⚠️

- [X] T012 [P] [US5] `backend/test/unit/services/rehearsal.service.test.ts`：`descriptor()` 對每個 `blockedReason` 各回傳正確值（`exam_initialized`、`exam_data_present`、`rehearsal_active`、`deploy_test_active`、`deploy_test_draining`、`student_judging_active`、`cleanup_pending`）
- [X] T013 [P] [US5] `backend/test/integration/controllers/admin/rehearsal.controller.test.ts`：四個端點無管理憑證皆回 `401`；缺 `acknowledgeWipe` 回 `400 acknowledge_required`；系統已初始化時啟動回 `409` **且考卷與 `User` 筆數不變**；部署測試進行中回 `409 deploy_test_active`

### Implementation

- [X] T014 [US5] 在 `backend/src/services/rehearsal.service.ts` 實作 `descriptor()`：檢查 `ExamStateService.getCurrentState() === UNINITIALIZED`、`SystemSettingsService.getExamConfig()` 為空、`User.count() === 0`、`JudgingWorkCoordinator` 狀態、以及上一次 run 的 `cleanupCompleted`，依 contracts/rehearsal-admin-api.md
- [X] T015 [US5] 在 `backend/src/services/rehearsal.service.ts` 實作 `start()` 的**准入檢查與拒絕路徑**（尚未執行任何段落）：`RehearsalAdmissionError`（`400`/`409`），拒絕時保證零副作用
- [X] T016 [US5] 實作 `backend/src/controllers/admin/admin-rehearsal.controller.ts` 的 `profile` / `start` / `latest` / `status` 四個方法，錯誤映射依契約（ZodError→400、AdmissionError→其 status、其餘→500 並記 log）
- [X] T017 [US5] 建立 `backend/src/routes/admin/admin-rehearsal.route.ts` 並在 `backend/src/routes/admin/index.ts` 以 `adminRouter.use("/rehearsal", ...)` 掛載（位於 `verifyAdminToken` 之下）

**Checkpoint**: 閘門就緒 —— 後續階段可以安全地在真實機器上試

---

## Phase 4: User Story 1 - 一鍵走完一場最小的考試 (Priority: P1) 🎯 MVP

**Goal**: 背景編排、六段狀態機、逐段持久化、整場 deadline；本階段實作第 1 段 `paper` 與第 6 段 `cleanup`，中間四段標為 `skipped`

**Independent Test**: 在乾淨系統上啟動演練，確認它自動完成「上傳考卷 → 初始化 → 進入 `INITIALIZED` → 全域 reset → 回到 `UNINITIALIZED`」，管理端全程可見逐段狀態，結束後系統資料歸零

### Tests (MANDATORY) ⚠️

- [X] T018 [P] [US1] 在 `backend/test/unit/services/rehearsal.service.test.ts` 新增編排測試（注入 `http` 替身與 `now`）：六段依序推進、段落失敗後其餘標為 `skipped`、整場 deadline 逾時 → `interrupted / deadline_exceeded`
- [X] T019 [P] [US1] `backend/test/unit/services/rehearsal-client.test.ts`：`http` 呼叫組裝正確（URL、method、`ADMIN_TOKEN` header），逐段逾時以替身計時器驗證
- [X] T020 [P] [US1] 在整合測試中驗證：`POST /admin/rehearsal` 回 `202` 且 `state === "queued"`；演練進行中再次啟動回 `200` + `alreadyRunning: true`；`GET /admin/rehearsal/latest` 回報進行中的 run
- [X] T021 [P] [US1] `frontend/test/RehearsalPanel.test.ts`：可啟動時顯示按鈕、按下必須先出現**明示會清空系統**的確認、六段狀態渲染正確、被拒絕時顯示 `blockedReason`

### Implementation

- [X] T022 [US1] 在 `backend/src/services/rehearsal-client.ts` 實作 loopback HTTP 客戶端：`BASE = http://127.0.0.1:${process.env.PORT || 3000}`，提供 `admin()`（帶 `ADMIN_TOKEN`）與 `user()` 兩種請求方法，逐請求逾時，回應以 `truncateJudgerOutput` 截斷後才寫入報告（research.md D1、FR-020）
- [X] T023 [US1] 在 `backend/src/services/rehearsal.service.ts` 實作段落狀態機：六段的 `pending`/`running`/`passed`/`failed`/`skipped` 轉移、逐段逾時、每次狀態變更即 `RehearsalRepository.replace()`（FR-017）
- [X] T024 [US1] 實作整場 deadline（預設 300000ms）與 `Dependencies` 注入形態（`now`、`http`、`examState`、`schedule`、`cancel`），沿用 `DeployTestService.configureForTests` 的形狀
- [X] T025 [US1] 實作 `start()` 的執行路徑：**先** `acquireRehearsal()`、**再**寫入 `ownsSystemState: true` 的 run 紀錄、**最後**才開始第 1 段 —— 此順序是重啟復原的全部依據（research.md D6），註解須寫明
- [X] T026 [US1] 實作第 1 段 `paper`：`POST /admin/config` → `POST /admin/init` → `GET /admin/exam-state`，三個 check 依 contracts/rehearsal-flow.md
- [X] T027 [US1] 實作第 6 段 `cleanup`：`POST /admin/init/reset` → 驗證 `UNINITIALIZED`、`init-status`、裝置與提交歸零，五個 check 依契約；**無論前面任何段落結果都會執行**
- [X] T028 [US1] 實作 `overallOutcome` 的收斂規則：段落失敗 → `state: "completed"` + `overallOutcome: "failed"`（**不是** `state: "failed"`，後者保留給編排自身例外），依 data-model.md §4
- [X] T029 [P] [US1] 建立 `frontend/src/api/rehearsal.ts`：四個端點的型別化呼叫與輪詢工具
- [X] T030 [P] [US1] 建立 `frontend/src/views/judge/components/RehearsalStageList.vue`：逐段狀態、耗時、失敗原因、逐項 check
- [X] T031 [US1] 建立 `frontend/src/views/judge/components/RehearsalPanel.vue`：啟動按鈕、**明示清空後果的確認對話框**（FR-003）、輪詢進度、整體結論
- [X] T032 [US1] 在 `frontend/src/views/judge/JudgeSettingsView.vue` 掛載 `RehearsalPanel`，與既有 `DeployTestPanel` 並列

**Checkpoint**: MVP —— 演練可跑完兩段並清乾淨，管理端全程可見

---

## Phase 5: User Story 4 - 演練結束後系統回到乾淨狀態 (Priority: P1)

**Goal**: 清除的可靠性 —— 從任一中間階段收斂、失敗時警示、重啟後自動完成

**Independent Test**: 在演練中途強制重啟後端，確認重啟後系統回到 `UNINITIALIZED`、資料歸零、報告標記為 `interrupted / process_restart`，且可立刻再啟動一次

### Tests (MANDATORY) ⚠️

- [X] T033 [P] [US4] `backend/test/unit/services/rehearsal-startup.service.test.ts`：非終態 run → 標記 `interrupted / process_restart` **且**執行清除；終態 run → 不動作；清除失敗 → `cleanupCompleted: false` + `cleanupError`
- [X] T034 [P] [US4] 在 `rehearsal.service.test.ts` 新增：任一中間段落失敗或逾時後，第 6 段仍被執行；第 1 段首個請求即失敗時，第 6 段標為 `skipped`（系統未變更，無可清除）
- [X] T035 [P] [US4] 在整合測試新增：`cleanupCompleted: false` 的 run 存在時，`descriptor()` 回 `cleanup_pending` 且 `start()` 回 `409`

### Implementation

- [X] T036 [US4] 實作 `backend/src/services/rehearsal-startup.service.ts`：讀取持久化 run，非終態則標記中斷並呼叫 `InitService.wipeAllData()`，結果寫回 `cleanupCompleted` / `cleanupError`
- [X] T037 [US4] 在 `backend/src/index.ts` 的啟動序列中，於 `DeployTestStartupService.run()` 之後呼叫 `RehearsalStartupService.run()`
- [X] T038 [US4] 在 `rehearsal.service.ts` 確保第 6 段從任一中間階段（`INITIALIZED` / `SETUP_FINISHED` / `IN_PROGRESS`）都能收斂 —— 全域 reset 不是階段轉移，本就可從任一階段執行，加測試釘住此性質
- [X] T039 [US4] 清除失敗時：`overallOutcome: "failed"`、`cleanupError` 填入截斷後原因，並讓 `descriptor()` 據此回 `cleanup_pending`（FR-015）
- [X] T040 [US4] 在 `RehearsalPanel.vue` 加上**顯著的殘留警示**：清除未完成時以醒目樣式告知助教系統仍有殘留、必須在上傳正式考卷前手動處理

**Checkpoint**: 清除可靠 —— 演練從此不是新的風險來源

---

## Phase 6: User Story 2 - 走的是學生真正走的那條路 (Priority: P1)

**Goal**: 第 2、3、4 段 —— 模擬學生經由真實對外 API 完成入場、登入、取卷、取金鑰、提交，含開考前索取金鑰必須被拒絕的反向檢查

**Independent Test**: 讓演練執行到第 4 段，確認取卷與提交都經由 `/user/**` 抵達並套用了與真實學生相同的階段與身分檢查；且 `exam_key_refused_before_start` 通過

### Tests (MANDATORY) ⚠️

- [X] T041 [P] [US2] 在 `rehearsal-client.test.ts` 新增握手測試：RSA-OAEP/SHA-256 包裝 AES-256 金鑰、AES-GCM 請求 body 形狀（`device_uuid`/`iv`/`ciphertext`/`tag`）、每個請求帶**新的** `nonce` 與 `timestamp`
- [X] T042 [P] [US2] 在 `rehearsal.service.test.ts` 新增：`/user/exam/key` 在 `INITIALIZED` 回 `409` → `exam_key_refused_before_start` **通過**；回 `200` → 該 check **失敗**（反向檢查）
- [X] T043 [P] [US2] 在整合測試新增第 2–4 段的端對端走查：以真實 app 跑完註冊 → 取卷 → 登入 → 取金鑰 → 解密 → 兩份提交，且 `LOAD_TEST_MODE` 未設定

### Implementation

- [X] T044 [US2] 在 `backend/src/services/rehearsal-client.ts` 實作模擬學生握手：`GET /user/auth/rsa-public-key` → 產生 AES-256 金鑰 → RSA-OAEP/SHA-256 包裝 → `POST /user/auth/register-device`（research.md D2）
- [X] T045 [US2] 實作 AES-GCM 請求包裝與 session token 攜帶，與 `decryptAndVerifyDeviceSession` 期望的形狀一致；**不得**依賴 `LOAD_TEST_MODE`
- [X] T046 [US2] 實作第 2 段 `enrol`：註冊 → `POST /user/exam/config` 取 meta+cipher → `POST /user/exam/environment-report` → **`POST /user/exam/key` 預期 `409 phase_not_allowed`**，五個 check 依契約
- [X] T047 [US2] 實作第 3 段 `admit`：`POST /admin/exam-state`（`SETUP_FINISHED`）→ `POST /user/auth/login`，三個 check；登入通過靠考卷名單不帶 IP，**不得**為此修改 `AuthService`
- [X] T048 [US2] 實作第 4 段 `submit`：`POST /admin/exam-state`（`IN_PROGRESS`）→ `POST /user/exam/key` → 以 `K_exam` 解密 cipher 並比對題目 id 與 meta 一致 → 兩次 `POST /user/submissions/code`，五個 check
- [X] T049 [US2] 在 `RehearsalStageList.vue` 呈現反向檢查的語意，避免助教把「被正確拒絕」誤讀為失敗

**Checkpoint**: 四個接縫中的三個已被端對端證明

---

## Phase 7: User Story 3 - 助教端手動評測確實會給出分數 (Priority: P1)

**Goal**: 第 5 段 —— 以助教身分觸發手動評測、等待完成、比對兩份提交的判定與分數，並在歸因為系統錯誤時判定失敗

**Independent Test**: 讓演練只執行到評測段，確認必然全對的提交取得滿分、必然答錯的取得預期的 WA 且歸因為學生；把 Piston 停掉重跑，確認本段失敗且指出是評測而非流程

### Tests (MANDATORY) ⚠️

- [X] T050 [P] [US3] 在 `rehearsal.service.test.ts` 新增：`outcome.systemFailures > 0` → 本段失敗且 `verdict_wa_matches` **不得**被標為通過（FR-011）
- [X] T051 [P] [US3] 新增：job 輪詢在上限內未達終態 → `judge_finished` 失敗並記逾時，**且第 6 段仍被執行**（FR-012、US3 場景 5）
- [X] T052 [P] [US3] 新增：`POST /admin/judger/judge/:testId` 回 `409` 時本段失敗並記錄拒絕原因（釘住 research.md D4 的 lease 設計 —— 此測試若紅燈，代表互斥模型又把演練擋在門外）

### Implementation

- [X] T053 [US3] 實作第 5 段 `grade`：`POST /admin/judger/judge/:testId` 取 `jobId` → 輪詢 `GET /admin/judger/jobs/:jobId` 直到終態或逾時（預設 180000ms）
- [X] T054 [US3] 實作判定比對：讀取該生成績單，`rehearsal-ac` 須滿分、`rehearsal-wa` 須零分，寫入 `verdict_ac_matches` / `verdict_wa_matches`
- [X] T055 [US3] 實作系統歸因的否決規則：`outcome.systemFailures > 0` 或任一 check 的 `attribution === "system"` → 本段失敗，且**不得**呈現為對某個學生錯誤判定的成功驗證（FR-011）
- [X] T056 [US3] 在 `RehearsalStageList.vue` 明確區分「學生的錯」與「系統的錯」兩種失敗的呈現

**Checkpoint**: 四個接縫全部被端對端證明；演練可完整走完六段

---

## Phase 8: User Story 6 - 演練報告可在事後查閱 (Priority: P2)

**Goal**: 報告在清除後與重新整理後皆可取得

**Independent Test**: 執行一次演練，中途重新整理確認進度回來；結束後重新進入頁面，確認最近一次報告完整可讀且載明執行時間

### Tests (MANDATORY) ⚠️

- [X] T057 [P] [US6] 在整合測試新增：完整跑完一次演練（含清除）後，`GET /admin/rehearsal/latest` 仍回傳完整報告 —— 釘住「`wipeAllData()` 不碰 `SystemSettings` 的一般 key」這個本功能依賴的性質（research.md D5）
- [X] T058 [P] [US6] 新增：`GET /admin/rehearsal/:runId` 對不相符的 id 回 `404`；從未跑過演練時 `latest` 回 `{ run: null }`
- [X] T059 [P] [US6] 在 `RehearsalPanel.test.ts` 新增：掛載時即載入 `latest`，進行中則續接輪詢，已結束則直接顯示報告

### Implementation

- [X] T060 [US6] 在 `RehearsalPanel.vue` 實作掛載時載入 `latest` 並依 `state` 決定是續看進度或顯示報告（US6 場景 1、2）
- [X] T061 [US6] 在報告呈現中加入執行時間戳記與逐段耗時（FR-018、US6 場景 4）

**Checkpoint**: 六個 user story 全部交付

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T062 [P] 確認 `backend/src/services/rehearsal-client.ts` 的所有回應寫入報告前皆經 `truncateJudgerOutput`（FR-020、NFR-SEC），補一條專門的測試
- [X] T063 [P] 全面檢查演練程式碼**沒有任何** `isRehearsal` 旗標、專屬端點或被略過的檢查（contracts/rehearsal-flow.md 不變式 #1）；以 grep 為證並記錄於 PR 描述
- [X] T064 [P] 覆蓋率檢查：`pnpm --filter backend run test:coverage`，確認新增檔案達憲法標準
- [X] T065 [P] `pnpm --filter backend run lint`、`pnpm --filter backend run build`、`pnpm --filter frontend run build` 全綠
- [X] T066 執行 [quickstart.md](./quickstart.md) §B 契約走查全表
- [ ] T067 ⚠️ **未執行（需要真實考場機器 + 真實 Piston）** 執行 quickstart.md §C-1 成功路徑（`LOAD_TEST_MODE` 未設定）
- [ ] T068 ⚠️ **未執行（需要真實部署）** 執行 quickstart.md §C-2 四種刻意破壞，確認失敗段落與實際破壞一致且系統仍被清乾淨（SC-003）
- [ ] T069 ⚠️ **未執行（需要真實部署）** 執行 quickstart.md §C-3 誤觸防線與 §C-4 中斷復原
- [X] T070 [P] 在 `knowledge/vision.md` 的「下一步里程碑」更新部署穩健性的狀態；若 §C 過程中學到非顯然的教訓，循 `knowie-capture` 收進知識庫

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：無相依
- **Phase 2 Foundational**：相依 Phase 1 —— **阻擋所有 user story**
- **Phase 3 US5**：相依 Phase 2。**必須先於 Phase 4**（閘門先於任何會變更系統的程式碼）
- **Phase 4 US1**：相依 Phase 3
- **Phase 5 US4**：相依 Phase 4（清除的硬化，建立在 US1 的第 6 段之上）
- **Phase 6 US2**：相依 Phase 4（需要段落狀態機與 HTTP 客戶端）
- **Phase 7 US3**：相依 Phase 6（評測需要先有提交）
- **Phase 8 US6**：相依 Phase 4
- **Phase 9 Polish**：相依全部

### 真正的相依鏈

```
Setup ─► Foundational ─► US5（閘門）─► US1（MVP：段 1 + 段 6）
                                          ├─► US4（清除硬化）
                                          ├─► US2（段 2,3,4）─► US3（段 5）
                                          └─► US6（報告查閱）
```

US4、US2+US3、US6 三條線在 US1 之後可平行。

### Within Each User Story

- 測試先寫、先紅燈，再實作
- schema / 型別 → repository → service → controller → route → 前端
- 後端段落完成後才接前端呈現

### Parallel Opportunities

- T003–T006（四個測試檔）可平行
- T007、T008、T009（schema／型別／考卷）可平行
- T029、T030（前端 api 與 StageList）可平行
- US4、US2、US6 三個階段可由不同人同時進行
- T062–T065（polish 的四項檢查）可平行

---

## Parallel Example: Phase 2

```bash
# 測試先行，四個檔案互不相干：
Task: "rehearsal.schema.test.ts —— schema 不變式"
Task: "rehearsal-paper.config.test.ts —— 考卷型別綁定與無 IP"
Task: "rehearsal-repository.test.ts —— 讀寫往返"
Task: "judging-work-coordinator.test.ts —— rehearsal lease 三條規則"

# 再平行實作互不相干的三個檔案：
Task: "rehearsal.schema.ts"
Task: "rehearsal.type.ts"
Task: "rehearsal-paper.config.ts"
```

---

## Implementation Strategy

### MVP（Phase 1–4）

閘門 + 編排 + 第 1 段 + 第 6 段。交付後助教已經可以按一個按鈕，證明「上傳考卷 → 初始化 → 清除」這一圈在這台機器上走得通，而且不會誤刪正式考卷。**這已經是有用的東西** —— 它涵蓋了整條鏈的兩端，也是部署當下最常壞的兩段。

### 增量交付

| 增量 | 交付內容 | 可作為考前防線 |
|---|---|---|
| MVP（US5+US1） | 閘門、編排、考卷載入與清除 | 部分 —— 只證明兩端 |
| + US4 | 清除可靠、重啟可復原 | 部分，但已可安心重複使用 |
| + US2 | 學生取卷與提交的三個接縫 | ✓ 已涵蓋測資保護是否生效 |
| + US3 | 助教評測接縫 | ✓ **建議至此再當成正式防線** |
| + US6 | 報告可事後查閱 | ✓ 可留部署紀錄 |

**建議上線門檻**：US3 完成之後。在此之前演練會宣告「通過」，但它沒有驗證過評測 —— 而評測是考試當天最常壞、也最傷學生的一段。一條會漏掉主要風險的防線，比沒有防線更危險，因為它會讓人停止擔心。

### 每個 Phase 的收尾條件

1. 該 Phase 的全部測試綠燈，且 `tsc -p tsconfig.test.json` 無誤
2. `pnpm --filter backend run lint` 無誤
3. US1 之後的每個 Phase，在真實機器上實際按一次按鈕走完該階段已實作的段落

---

## Notes

- `[P]` = 不同檔案、無相依
- 演練會在真實系統上寫真實資料。**每次在真實機器上測試之前，先確認那台機器上沒有你在乎的考卷。**
- 三處最該被 review 盯住的地方：T025 的寫入順序（重啟復原的全部依據）、T011 的 `acquireStudent()` 未修改（演練能走完評測的唯一原因）、T063 的無旁路確認（安全模型不變的證明）
