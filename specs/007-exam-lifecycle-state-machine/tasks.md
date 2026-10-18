---
description: "Task list for feature 007 — exam lifecycle state machine and paper encryption"
---

# Tasks: Exam Lifecycle State Machine and Paper Encryption

**Input**: Design documents from `/specs/007-exam-lifecycle-state-machine/`

**Prerequisites**: plan.md, spec.md, design.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 依憲法（100% 測試覆蓋率）為**必要**，每個 user story 皆先寫測試。

**Organization**: 依 user story 分組。每個 story 可獨立驗證，但**多數 story 同時橫跨兩個 repo** —— 見下方「跨 repo 佈署」。

> **2026-10-15 增量執行入口**：本次 FR-044–FR-049 的新工作由 Phase 11／T148 開始；T001–T147 保留原完成狀態，T117–T126 的未完成驗收仍需追蹤。舊 MVP 與執行順序為原始建置歷史，本次以文件末尾的增量依賴與 MVP 為準。T065 原線上 meta 觸發檢查由 T165 取代，離線路徑保留。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、無未完成相依）
- **[Story]**: 對應 spec.md 的 user story

## Path Conventions

本功能橫跨兩個獨立 repo，路徑一律加上 repo 前綴：

- `host/` → `~/Documents/ntut-exam-v2/host`，分支 `feat/007-environment-precheck-plan`
- `desktop/` → `~/Documents/ntut-exam-v2/desktop`，原始分支 `feat/003-exam-lifecycle-state-machine`；本次實作使用含配套基線的 `feat/` 分支

## 跨 repo 佈署

**⚠️ 不做向後相容**（plan.md C3）。US1–US5 皆同時修改兩個 repo 的契約，該 story 的兩邊變更**必須同時佈署**。每個 story 完成時在兩個 repo 各開一個 PR，描述互相引用並註明「必須同時 merge」。

合併順序：後端先、桌面版後。**佈署順序相反** —— 桌面版是安裝到考試機器上的，打包前後端必須已是最終版本。

---

## Phase 1: Setup（共用基礎）

**Purpose**: 建立兩個 repo 之間唯一的契約錨點。這必須最先做，因為後續兩端的 schema 都以它為準。

- [X] T001 在 `host/backend/test/fixtures/exam-config-payload.fixture.json` 建立契約 fixture，依 contracts/ G26 涵蓋 `meta`、`cipher` 封包、`wrappedExamKey` 三種結構，且每種都含「選填欄位存在」與「選填欄位缺席」兩組樣本
- [X] T002 將 `host/backend/test/fixtures/exam-config-payload.fixture.json` **逐位元組複製**到 `desktop/test/fixtures/exam-config-payload.fixture.json`
- [X] T003 將同一份檔案**逐位元組複製**到 `host/frontend/test/fixtures/exam-config-payload.fixture.json` —— config schema 共有**三份**定義：backend zod、desktop zod、frontend TS type
- [X] T004 [P] 在 `host/package.json` 新增 `test:contract-fixture` script，以 `diff` 比對**三份** fixture 並在任一份不一致時失敗（contracts/ G25）
- [X] T005 [P] 在 `host/specs/007-exam-lifecycle-state-machine/` 記錄 fixture 的維護規則：任一端修改契約必須同步三份檔案

**Checkpoint**: 契約錨點就位，兩端可各自開始定義 schema

---

## Phase 2: Foundational（阻塞性前置）

**Purpose**: 五階段值域、轉移表與權限矩陣。這是後面所有 story 掛載的骨架。

**⚠️ CRITICAL**: 本階段完成前，任何 user story 不得開始

### Tests

- [X] T006 [P] 在 `host/backend/test/unit/services/exam-state.service.test.ts` 撰寫轉移表測試，涵蓋 data-model.md §1 的全部 5×5 = 25 種組合（4 種合法、21 種必須拒絕）
- [X] T007 [P] 在 `host/backend/test/unit/middlewares/exam-phase.middleware.test.ts` 撰寫權限矩陣測試，涵蓋 contracts/ §2 的 13 端點 × 5 階段
- [X] T008 [P] 在 `desktop/test/ui/phase-derivation.test.ts` 撰寫畫面推導測試，涵蓋 EXAM-LIFECYCLE.md §4.2 的 5 階段 × 3 裝置狀態

### Implementation

- [X] T009 在 `host/backend/src/services/exam-state.service.ts` 將 `ExamState` enum 改為 `UNINITIALIZED / INITIALIZED / SETUP_FINISHED / IN_PROGRESS / FINISHED`
- [X] T010 在 `host/backend/src/services/exam-state.service.ts` 加入轉移表並於 `changeState` 前驗證，拒絕跳階、回退與 `from === to`
- [X] T011 在 `host/backend/src/services/exam-state.service.ts` 新增 `getAllowedNext()`，回傳至多一個元素（contracts/ §3）
- [X] T012 建立 `host/backend/src/middlewares/exam-phase.middleware.ts`，以宣告式路由對階段表實作，未列出的 `/user/*` 端點預設拒絕（contracts/ G3）
- [X] T013 在 `host/backend/src/routes/user/index.ts` 掛載 `exam-phase.middleware.ts`，位於 `loadTestIpMockMiddleware` 之後、各子路由之前
- [X] T014 [P] 在 `host/backend/src/services/system-settings.service.ts` 將 `exam_key`、`exam_config_cipher`、`exam_config_meta` 加入 `PROTECTED_SETTINGS_KEYS`
- [X] T015 [P] 在 `desktop/src/common/types.ts` 將 `ExamState` type 改為五個新值
- [X] T016 在 `desktop/src/renderer/router/index.ts` 改為 EXAM-LIFECYCLE.md §4.2 的推導式守衛，移除既有的散落條件判斷
- [X] T017 在 `desktop/src/renderer/router/index.ts` 於 `SETUP_FINISHED` 之後禁止進入 Settings 頁（spec.md FR-008）

**Checkpoint**: 階段骨架就位，user story 可開始

---

## Phase 3: User Story 1 — 依序推進的入場流程 (P1) 🎯 MVP

**Goal**: 管理員依序推進五個階段，每階段只開放該階段應發生的事；學生在正確的時機看到正確的畫面；監考端看得到全班就緒狀況。

**Independent Test**: 在乾淨部署上依序推進五個階段，確認每階段只允許該階段的操作、其餘一律被拒，且無法跳階或回退（quickstart.md B-1 ~ B-13）。

### Tests for User Story 1 (MANDATORY) ⚠️

- [X] T018 [P] [US1] 在 `host/backend/test/integration/controllers/admin/admin-exam-state.controller.test.ts` 測試 `GET /admin/exam-state` 回傳 `allowedNext`，且 `FINISHED` 時為空陣列
- [X] T019 [P] [US1] 在 `host/backend/test/unit/services/device.service.test.ts` 測試註冊在 `INITIALIZED` 開放、`SETUP_FINISHED` 起關閉（spec.md FR-006）
- [X] T020 [P] [US1] 在 `host/backend/test/integration/controllers/user/user-exam.controller.test.ts` 測試 `POST /user/exam/environment-report` 在未登入狀態下可用
- [X] T021 [P] [US1] 在 `host/backend/test/unit/services/exam-state.service.test.ts` 測試收卷緩衝：`FINISHED` 後 `submitGraceSeconds` 內接受提交、之後拒絕（spec.md FR-033/034）
- [X] T022 [P] [US1] 在 `desktop/test/ipc/auth.ipc.test.ts` 測試裝置註冊已自登入流程拆出，可獨立呼叫
- [X] T023 [P] [US1] 在 `desktop/test/ui/standby-page.test.ts` 測試 `INITIALIZED` 待命畫面**不提供登入入口**
- [X] T024 [P] [US1] 在 `host/frontend/test/exam-state-controls.test.ts` 測試管理端只呈現「下一階段」與 reset 兩個動作，且五個階段名稱正確

### Implementation for User Story 1

- [X] T025 [US1] 在 `host/backend/src/services/exam-state.service.ts` 將 `setAllowDeviceRegistration(false)` 的觸發點從 `IN_PROGRESS` 移到 `SETUP_FINISHED`，並在 `INITIALIZED` 設為 `true`
- [X] T026 [US1] 在 `host/backend/src/services/init.service.ts` 移除初始化時的 `setAllowDeviceRegistration(true)`，改由 `exam-state.service.ts` 的階段副作用負責
- [X] T027 [P] [US1] 在 `host/backend/src/models/device-key-map.model.ts` 新增 `envCheckStatus`、`envCheckFailedLanguages`、`envCheckReportedAt`、`lastDisconnectedAt` 欄位（data-model.md §6）
- [X] T028 [US1] 在 `host/backend/src/controllers/user/user.controller.ts` 新增 `POST /user/exam/environment-report` 處理，驗證層級為「已註冊裝置」，payload 僅接受 `status` 與 `failedLanguages`（contracts/ G12）
- [X] T029 [US1] 在 `host/backend/src/routes/user/user-exam.route.ts` 掛載 `POST /user/exam/environment-report` 路由
- [X] T030 [US1] 在 `host/backend/src/sockets/message-socket.service.ts` 的 disconnect handler 寫入 `lastDisconnectedAt`
- [X] T031 [US1] 在 `host/backend/src/controllers/admin/admin-exam-state.controller.ts` 的 `getState` 加入 `allowedNext`，`changeState` 回傳 `invalid_transition` 與 `preconditions_not_met` 兩種錯誤（contracts/ G4/G5）
- [X] T032 [US1] 在 `host/backend/src/middlewares/exam-phase.middleware.ts` 實作收卷緩衝：`FINISHED` 後依 `submitGraceSeconds` 判定提交端點的允許與否
- [X] T033 [P] [US1] 在 `host/frontend/src/stores/manage.store.ts` 加入 `allowedNext` 狀態
- [X] T034 [US1] 改寫 `host/frontend/src/views/manage/components/ExamStateControls.vue` 為「下一階段」單一按鈕加 reset，移除四顆任選按鈕
- [X] T035 [US1] 在 `host/frontend/src/stores/config.store.ts` 將初始化後硬編的 `examState = 'NOT_STARTED'` 改為 `'INITIALIZED'`，並改為向後端重新查詢而非硬編
- [X] T036 [P] [US1] 在 `host/frontend/src/stores/manage.store.ts` 將 `examState` 預設值由 `'NOT_STARTED'` 改為 `'UNINITIALIZED'`
- [X] T037 [US1] 在 `host/frontend/src/views/config/components/DbInitPanel.vue` 顯示後端回傳的 `preconditions_not_met` 缺項清單，取代目前只有成功／失敗的提示
- [X] T038 [P] [US1] 建立 `host/frontend/src/api/readiness.ts` 與 `host/frontend/src/stores/readiness.store.ts`
- [X] T039 [US1] 建立 `host/frontend/src/views/manage/components/StudentReadiness.vue`，依 EXAM-LIFECYCLE.md §4.3 的四項條件呈現就緒狀態
- [X] T040 [US1] 在 `desktop/src/main/ipc/auth.ipc.ts` 將裝置註冊自 `auth:login` 拆出為獨立的 `auth:register` 流程，供 `INITIALIZED` 階段呼叫
- [X] T041 [US1] 建立 `desktop/src/renderer/pages/StandbyPage.vue`（`INITIALIZED` 待命畫面），顯示註冊與環境檢查進度，**不提供登入入口**
- [X] T042 [US1] 在 `desktop/src/renderer/router/index.ts` 加入 `/standby` 路由並納入推導表
- [X] T043 [US1] 在 `desktop/src/main/services/environment-check.service.ts` 於檢查完成時呼叫 `POST /user/exam/environment-report` 上報結果

**Checkpoint**: 五階段依序運作，監考端看得到準備狀況。此時考卷仍走舊的整份下發。

---

## Phase 4: User Story 2 — 考卷在開考前不可讀 (P1)

**Goal**: 考卷與測資在 `INITIALIZED` 即送達每台機器，但開考前無法讀取；開考時才釋出解讀能力。

**Independent Test**: 在開考前檢視已登入機器持有的考卷資料，確認 0 筆測資可讀；推進到開考後確認可讀（quickstart.md B-6、B-10）。

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T044 [P] [US2] 在 `host/backend/test/unit/services/exam-config-crypto.service.test.ts` 測試 `config.meta` 序列化後不含 `"input"`、`"output"`、`puzzles[].title`、`puzzles[].score`、`subtasks`、`specialRules`、`startPassword`（contracts/ G8）
- [X] T045 [P] [US2] 在同檔測試 `config.cipher` 以 `K_exam` AES-256-GCM 加密、每次使用新 IV，且竄改一位元組後解密拋錯（contracts/ G28）
- [X] T046 [P] [US2] 在 `host/backend/test/integration/controllers/user/user-exam.controller.test.ts` 測試 `POST /user/exam/key` 僅 `IN_PROGRESS` 回應，其餘階段回 `409` 且不透露金鑰是否存在（contracts/ G9）
- [X] T047 [P] [US2] 在同檔測試 `POST /user/exam/config` 免除 session token、僅需已註冊裝置即可取得 `{ meta, cipher }`（contracts/ G7）
- [X] T048 [P] [US2] 在 `host/backend/test/unit/schemas/config.schema.test.ts` 以 `host/backend/test/fixtures/exam-config-payload.fixture.json` 驗證 `meta`／`secret`／`wrappedExamKey` schema
- [X] T049 [P] [US2] 在 `desktop/test/service/examConfig.schema.test.ts` 以 `desktop/test/fixtures/exam-config-payload.fixture.json` 驗證桌面版對應 schema（zod ^4 行為差異在此暴露）
- [X] T050 [P] [US2] 在 `desktop/test/service/config-merge.test.ts` 測試 `mergeExamConfig(meta, secret)` 的結果通過既有 `examConfigSchema`，且 `puzzle.id` 集合不一致時拋錯
- [X] T051 [P] [US2] 在 `host/frontend/test/config-schema.test.ts` 以 `host/frontend/test/fixtures/exam-config-payload.fixture.json` 驗證 `frontend/src/types/config.ts` 的 `ExamConfig`（三份定義的第三份）

### Implementation for User Story 2

- [X] T052 [US2] 在 `host/backend/src/schemas/config.schema.ts` 新增 `examConfigMetaSchema`、`examConfigSecretSchema`、`wrappedExamKeySchema`（data-model.md §3/§4）
- [X] T053 [US2] 在 `host/backend/src/schemas/config.schema.ts` 的 `judgerSettings` 之外新增 `submitGraceSeconds`，預設 60（research.md R1）
- [X] T054 [US2] 建立 `host/backend/src/services/exam-config-crypto.service.ts`：產生 `K_exam`、切分 meta/cipher、AES-256-GCM 加密、PBKDF2 600,000 迭代包裝 `wrappedExamKey`（research.md R2/R6）
- [X] T055 [US2] 在 `host/backend/src/services/exam-config-crypto.service.ts` 加入口令長度警告：少於 6 字元時回報需二次確認的旗標（research.md R4）
- [X] T056 [US2] 在 `host/backend/src/services/init.service.ts` 的初始化流程呼叫 `exam-config-crypto.service.ts`，將三項產出存入 `SystemSettings`
- [X] T057 [US2] 在 `host/backend/src/services/exam-state.service.ts` 的 `UNINITIALIZED → INITIALIZED` 前置檢查加入「`K_exam`、`cipher`、`meta` 皆已產生」（contracts/ G5）
- [X] T058 [US2] 改寫 `host/backend/src/services/exam.service.ts` 的 `getSecureConfig`：驗證層級放寬為已註冊裝置，回傳 `{ meta, cipher }`
- [X] T059 [US2] 在 `host/backend/src/controllers/user/user.controller.ts` 與 `host/backend/src/routes/user/user-exam.route.ts` 新增 `POST /user/exam/key`，僅 `IN_PROGRESS` 回應且冪等（contracts/ G9/G11）
- [X] T060 [US2] 確認 `startPassword` 不出現在任何下發 payload —— 檢查 `exam.service.ts` 與 `exam-config-crypto.service.ts` 的輸出（spec.md FR-026）
- [X] T061 [US2] 在 `host/backend/src/services/exam-config.service.ts` 的考卷更新流程重新產生 meta/cipher，**不重新產生 `K_exam`**（design.md §7.4）
- [X] T062 [US2] 在 `desktop/src/main/schemas/examConfig.schema.ts` 新增 meta/secret/wrappedExamKey schema 並實作 `mergeExamConfig()`
- [X] T063 [US2] 在 `desktop/src/main/services/ramStore.service.ts` 新增 `examConfigMeta`、`examConfigCipher`、`examKey` 欄位，`examConfig` 維持既有形狀且**開考前為 `null`**（data-model.md §5、research.md R10）
- [X] T064 [US2] 在 `desktop/src/main/services/crypto.service.ts` 新增 `K_exam` 解密 cipher 的函式
- [X] T065 [US2] 在 `desktop/src/main/services/config.service.ts` 改為接收 `{ meta, cipher }`，僅以 meta 觸發環境檢查
- [X] T066 [US2] 在 `desktop/src/main/services/message-sync.service.ts` 收到 `IN_PROGRESS` 廣播後呼叫 `POST /user/exam/key`，取得金鑰後解密並合併（contracts/ G19）
- [X] T067 [US2] 確認 `host/backend/src/sockets/message-socket.service.ts` 的開考廣播不含金鑰或任何可導出金鑰的資訊（contracts/ G10）
- [X] T068 [P] [US2] 在 `host/frontend/src/types/config.ts` 的 `ExamConfig` 新增 `submitGraceSeconds`（該檔既有註解已記錄 004 的同類漂移事故）
- [X] T069 [P] [US2] 在 `host/frontend/src/stores/config.store.ts` 的預設 config 加入 `submitGraceSeconds: 60`
- [X] T070 [US2] 在 `host/frontend/src/views/config/components/GeneralSettingsEditor.vue` 新增 `submitGraceSeconds` 表單欄位（收卷緩衝秒數）
- [X] T071 [US2] 在 `host/frontend/src/views/config/components/GeneralSettingsEditor.vue` 改寫 `startPassword` 的標籤與說明 —— 它已由「開考的 UI 閘門」變更為「考卷解密金鑰」，管理員必須知道這個語意改變
- [X] T072 [US2] 在 `host/frontend/src/views/config/components/ConfigForm.vue` 加入口令弱度警告與二次確認（少於 6 字元），警告文字須說明考卷在開考前的保護強度等同於此口令（research.md R4）

**Checkpoint**: 開考前 0 筆測資可讀（SC-001）。下游程式碼應 0 處修改（SC-009）。

---

## Phase 5: User Story 3 — 機器重啟後能回到考試 (P1)

**Goal**: 機器重啟後，經一次助教核准即可回到考試，已提交的作答自動復原。

**Independent Test**: 考試中重啟一台機器，走完重新入場流程，確認回到考試畫面且已提交作答 100% 復原（quickstart.md B-18 ~ B-22）。

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T073 [P] [US3] 在 `host/backend/test/unit/services/device.service.test.ts` 測試被拒絕的註冊請求**不修改** `DeviceKeyMap` 任何欄位，特別是既有裝置的 `status`（contracts/ G13）
- [X] T074 [P] [US3] 在同檔測試同一 `deviceUuid` 連送三次註冊只產生一筆 `PENDING` 申請（contracts/ G14）
- [X] T075 [P] [US3] 在同檔測試三種申請分類的判別：`NEW_DEVICE` / `REBIND` / `UNBOUND_DEVICE`（research.md R3）
- [X] T076 [P] [US3] 在 `host/backend/test/integration/controllers/admin/connection.controller.test.ts` 測試 `POST /admin/device/:uuid/re-entry` 清除裝置身分但**不觸及** `Submission` 與 `ScoreBoard`（contracts/ G18）
- [X] T077 [P] [US3] 在 `desktop/test/ipc/auth.ipc.test.ts` 測試重啟後（無 `cryptoState`）走註冊申請路徑，而非直接失敗

### Implementation for User Story 3

- [X] T078 [P] [US3] 在 `host/backend/src/models/login-request.model.ts` 將 `type` 值域改為 `NEW_DEVICE / REBIND / UNBOUND_DEVICE`，新增 `previousTestId`
- [X] T079 [US3] 在 `host/backend/src/services/device.service.ts` 移除 throw 403 之前對 `existing.status` 的寫入（spec.md FR-010）
- [X] T080 [US3] 在 `host/backend/src/services/device.service.ts` 依 data-model.md §7 的判別條件分類三種申請並填入 `previousTestId`
- [X] T081 [US3] 在 `host/backend/src/services/device.service.ts` 的申請建立加入去重檢查（contracts/ G14）
- [X] T082 [US3] 在 `host/backend/src/services/binding.service.ts` 新增 `reEntry(deviceUuid)`：`forceLogoutDevice` 加 `unregisterDevice`，明確不觸及成果層
- [X] T083 [US3] 在 `host/backend/src/controllers/admin/connection.controller.ts` 與 `host/backend/src/routes/admin/connection.route.ts` 新增 `POST /admin/device/:deviceUuid/re-entry`
- [X] T084 [US3] 在 `desktop/src/main/ipc/auth.ipc.ts` 讓註冊失敗回 `entry_pending` 時進入待審畫面，而非清空 `cryptoState` 後失敗
- [X] T085 [US3] 建立 `desktop/src/renderer/pages/PendingApprovalPage.vue`（待審畫面），輪詢核准狀態
- [X] T086 [US3] 在 `desktop/src/renderer/router/index.ts` 將待審畫面納入推導表
- [X] T087 [US3] 確認 `desktop/src/main/ipc/auth.ipc.ts` 登入後的 `getSubmissions` 復原流程在重來路徑上同樣執行（spec.md US3-2）

**Checkpoint**: 目前 100% 重現的重啟死路已修復（SC-002）。

---

## Phase 6: User Story 4 — 後端不可用時考試仍能開始與進行 (P2)

**Goal**: 開考不依賴後端可用；斷線期間作答不受影響且恢復後自動補送。

**Independent Test**: 關閉後端，僅以口令讓一台機器開考並完整作答到底（quickstart.md C-7 ~ C-10）。

### Tests for User Story 4 (MANDATORY) ⚠️

- [X] T088 [P] [US4] 在 `host/backend/test/unit/services/exam-config-crypto.service.test.ts` 測試兩條路徑導出的金鑰**逐位元組相同**（contracts/ G27）
- [X] T089 [P] [US4] 在 `desktop/test/service/crypto.service.test.ts` 測試錯誤口令解不開 `wrappedExamKey`，且考卷維持不可讀
- [X] T090 [P] [US4] 在 `desktop/test/service/connection.service.test.ts` 測試待送佇列：斷線期間累積、恢復後依序重送、失敗放回佇列不丟棄（data-model.md §9）
- [X] T091 [P] [US4] 在 `desktop/test/service/connection.service.test.ts` 測試同一題目重複提交以最後一筆為準，佇列不無限成長
- [X] T092 [P] [US4] 在 `desktop/test/service/config.service.test.ts` 測試離線佈署檔與線上回應共用同一套解析（contracts/ G22）

### Implementation for User Story 4

- [X] T093 [US4] 在 `desktop/src/main/services/crypto.service.ts` 實作 PBKDF2-HMAC-SHA256 600,000 迭代導出並解開 `wrappedExamKey`（research.md R2）
- [X] T094 [US4] 改寫 `desktop/src/renderer/pages/WaitingForExamPage.vue`：口令由「與 config 明文比對」改為「導出金鑰並解密考卷」，成功才進入考試
- [X] T095 [US4] 在 `desktop/src/main/services/connection.service.ts` 以 `pendingSubmissions` 與 `pendingScores` 佇列取代 `pendingTestResult` / `pendingProgramFile` 旗標（data-model.md §9）
- [X] T096 [US4] 在 `desktop/src/main/services/connection.service.ts` 的 `onConnectionRestored` 依 data-model.md §9 的順序重送，失敗項目放回佇列
- [X] T097 [US4] 在 `desktop/src/main/services/judge-manager.service.ts` 將評測結果與程式碼提交在斷線時推入佇列而非只設旗標
- [X] T098 [P] [US4] 在 `host/backend/src/controllers/admin/exam-config.controller.ts` 新增離線佈署檔匯出端點，輸出 `{ meta, cipher }`（contracts/ §8）
- [X] T099 [P] [US4] 在 `host/frontend/src/views/config/ConfigView.vue` 加入匯出按鈕與口令保管提示
- [X] T100 [US4] 在 `desktop/src/main/services/config.service.ts` 將 `setConfigFromFile` 改為接受 `{ meta, cipher }` 佈署檔，**移除明文完整考卷的載入路徑**（contracts/ G24）
- [X] T101 [US4] 在 `desktop/src/main/services/ramStore.service.ts` 將 `isOfflineMode` 的判定改為「是否曾成功完成裝置註冊」（spec.md FR-028、data-model.md §8）

**Checkpoint**: 後端完全不可用時仍有 100% 機器能開考（SC-003）。

---

## Phase 7: User Story 5 — 全域 reset 讓系統乾淨回到起點 (P2)

**Goal**: reset 後所有機器不殘留任何舊考試的身分或考卷，且可立即重新入場。

**Independent Test**: 考試中執行 reset，確認所有機器回到等待畫面且不殘留資料，接著重新初始化並讓同一批機器完成註冊（quickstart.md B-25 ~ B-27）。

### Tests for User Story 5 (MANDATORY) ⚠️

- [X] T102 [P] [US5] 在 `host/backend/test/integration/controllers/admin/exam-config.controller.test.ts` 測試 reset 清除 `exam_key`、`exam_config_cipher`、`exam_config_meta`
- [X] T103 [P] [US5] 在同檔測試 reset 廣播 `exam-reset` 獨立事件，且**不寫入** `Message` 表（contracts/ G20/G21）
- [X] T104 [P] [US5] 在 `desktop/test/service/message-sync.service.test.ts` 測試收到 `exam-reset` 後 data-model.md §8 標示為「清」的欄位全數清空

### Implementation for User Story 5

- [X] T105 [US5] 在 `host/backend/src/sockets/message-socket.service.ts` 新增 `sendExamReset()`，發送獨立的 `exam-reset` 事件
- [X] T106 [US5] 在 `host/backend/src/services/init.service.ts` 的 `wipeAllData` 加入清除三個新 `SystemSettings` 鍵，並改為呼叫 `sendExamReset()` 而非一般階段廣播
- [X] T107 [US5] 在 `host/backend/src/services/init.service.ts` 將 reset 的階段設定與 `changeState` 的程式路徑分離（contracts/ G6）
- [X] T108 [US5] 在 `desktop/src/main/services/ramStore.service.ts` 新增 `clearForReset()`，依 data-model.md §8 清除全部標示項目，含 `localProgramStore` 暫存目錄
- [X] T109 [US5] 在 `desktop/src/main/services/message-sync.service.ts` 監聽 `exam-reset` 並呼叫 `ramStore.clearForReset()`，隨後導向等待畫面

**Checkpoint**: reset 後重新註冊成功率 100%（SC-005）。

---

## Phase 8: User Story 6 — 助教能判斷並處理入場例外 (P3)

**Goal**: 助教在單一畫面即可區分三種入場情境並完成處置，換機只需一次核准。

**Independent Test**: 製造三種入場情境，確認監考端能分別辨識，且換機情境只需一次核准（quickstart.md B-19）。

### Tests for User Story 6 (MANDATORY) ⚠️

- [X] T110 [P] [US6] 在 `host/backend/test/integration/controllers/admin/connection.controller.test.ts` 測試 `GET /admin/connection/requests` 回傳 contracts/ §6 的全部判斷欄位
- [X] T111 [P] [US6] 在同檔測試 `approve` 帶 `targetTestId` 時**同一次呼叫**解除兩邊綁定（contracts/ G17）
- [X] T112 [P] [US6] 在同檔測試 `reject` 後裝置與學生狀態完全不變（spec.md US6-3）

### Implementation for User Story 6

- [X] T113 [US6] 在 `host/backend/src/controllers/admin/connection.controller.ts` 的 `getRequests` join 出原綁學生姓名、是否他機在線、`lastDisconnectedAt`、IP 是否與名單相符
- [X] T114 [US6] 在 `host/backend/src/controllers/admin/connection.controller.ts` 的 `approveRequest` 接受 `targetTestId`，依 contracts/ G17 解除兩邊綁定並回傳 `unbound`
- [X] T115 [P] [US6] 在 `host/frontend/src/views/connection/ConnectionView.vue` 依三種情境分組呈現待審清單並顯示判斷資訊
- [X] T116 [US6] 在 `host/frontend/src/views/connection/ConnectionView.vue` 的核准對話框加入「這台機器接下來給哪個學號」的選擇

**Checkpoint**: 助教不需查詢其他畫面即可判斷（SC-007）。

---

## Phase 9: Polish & Cross-Cutting

- [X] T117 [P] 在 `host/backend/src/services/exam-state.service.ts` 與 `desktop` 兩端確認 `ExamPhase` 五值完全一致，無殘留的 `NOT_STARTED` 字串（舊值僅留在說明與拒絕測試）
- [X] T118 [P] 執行 quickstart.md §A 全部自動化驗證，確認兩端測試皆綠且 fixture `diff` 無差異
- [ ] T119 執行 quickstart.md §B 六階段人工走查 27 步，**第 6、10、26 步不可省**
- [ ] T120 執行 quickstart.md §C 全程離線走查 11 步
- [ ] T121 執行 quickstart.md §D 安全性驗證 7 項
- [ ] T122 執行 quickstart.md §E 回歸驗證，確認 judger／UI／special rules 的既有測試 0 處修改（SC-009）
- [X] T123 [P] 量測 `POST /user/exam/key` 與 `POST /user/exam/config` 的回應大小比例，確認小於 1%（SC-004；60 題整合測試）
- [X] T124 [P] 更新 `host/knowledge/vision.md` 的目前狀態與里程碑
- [X] T125 [P] 將本功能的教訓寫入 `host/knowledge/experience.md`（跨 repo 契約、扣留金鑰的設計取捨）
- [ ] T126 在兩個 repo 各開 PR，描述互相引用並註明「必須同時 merge」

---

## Phase 10: Bugfix Round 1 —— 現場走查回報的七個缺陷

**Purpose**: 修正 007 首次完整實作後現場走查發現的七個缺陷。逐條對應 `bugfixes.md` BUG-01 ～ BUG-07 與 spec.md FR-035 ～ FR-043。

**⚠️ 契約變更**: T127 改變後端錯誤回應的欄位語意，桌面版依賴之。兩個 repo 必須同時佈署。

### Tests for Bugfix Round 1 (MANDATORY) ⚠️

- [X] T127 [P] 在 `host/backend/test/unit/services/auth.service.test.ts` 斷言四個綁定錯誤的 `code` 欄位是碼、`message` 欄位是人類可讀訊息（BUG-04，FR-035）
- [X] T128 [P] 在 `host/backend/test/unit/services/binding.service.test.ts` 斷言 unbind 後 `user.ipAddress` 回到名單值而非 `null`（BUG-04，FR-037）
- [X] T129 [P] 在 `host/backend/test/unit/controllers/connection.controller.test.ts` 斷言核准入場時一併發出來源位置例外（BUG-04，FR-037）
- [X] T130 [P] 在 `desktop/test/ipc/auth.ipc.test.ts` 斷言任何登入失敗都不清除 `cryptoState`（BUG-04，FR-036）
- [X] T131 [P] 在 `desktop/test/ui/phase-derivation.test.ts` 涵蓋離線機器的推導：`SETUP_FINISHED`／`IN_PROGRESS` × 離線 → 不得是 `pending-approval`（BUG-03，FR-040）
- [X] T132 [P] 在 `desktop/test/service/config.service.test.ts` 斷言 `initFromPreSettings` 在有 `remoteHost` 時標記為已佈署（BUG-02，FR-039）
- [X] T133 [P] 在 `desktop/test/ipc/auth.ipc.test.ts` 斷言登入成功且階段已是 `IN_PROGRESS` 時，會取得解讀能力並還原考卷（BUG-05，FR-041）
- [X] T134 [P] 在 `desktop/test/service/localProgram.service.test.ts` 與 `desktop/test/ipc/judger.ipc.test.ts` 斷言路徑為 `undefined` 時以明確錯誤拒絕（BUG-07，FR-042）
- [X] T135 [P] 在 `desktop/test/service/connection.service.test.ts` 斷言 reset 清空補送佇列（BUG-06，FR-043）

### Implementation for Bugfix Round 1

- [X] T136 在 `host/backend/src/services/auth.service.ts` 修正四處 `HttpError` 的參數順序（BUG-04，FR-035）
- [X] T137 在 `host/backend/src/services/binding.service.ts` 讓 `unbindUser`／`unregisterDevice` 把 `ipAddress` 還原成名單值（BUG-04，FR-037）
- [X] T138 在 `host/backend/src/controllers/admin/connection.controller.ts` 讓核准一併發出來源位置例外，並把核准對象寫回申請列（BUG-04，FR-037）
- [X] T139 在 `desktop/src/main/ipc/auth.ipc.ts` 移除登入失敗時的 `cryptoState` 清除（BUG-04，FR-036）
- [X] T140 在 `desktop/src/renderer/router/phase-derivation.ts` 讓推導接受「離線機器」輸入（BUG-03，FR-040）
- [X] T141 在 `desktop/src/renderer/router/navigate.ts`、`index.ts` 傳入離線旗標，並讓 `settings` 在已有後端位址時導向推導畫面（BUG-02／BUG-03，FR-039、FR-040）
- [X] T142 在 `desktop/src/main/services/config.service.ts` 讓 `initFromPreSettings` 標記已佈署（BUG-02，FR-039）
- [X] T143 在 `desktop/src/renderer/App.vue` 集中訂閱階段變更並重新推導；移除各頁面重複的訂閱（BUG-01，FR-038）
- [X] T144 在 `desktop/src/renderer/pages/ExamPage.vue` 只保留收卷緩衝的責任（BUG-01，FR-038）
- [X] T145 在 `desktop/src/main/services/config.service.ts` 新增冪等的 `ensureExamPaperReadable()`，並在登入成功與收到考卷後呼叫（BUG-05，FR-041）
- [X] T146 在 `desktop/src/preload/index.ts` 以 `webUtils.getPathForFile` 提供 `files.getPath`，並更新三處呼叫端（BUG-07，FR-042）
- [X] T147 在 `desktop/src/main/services/connection.service.ts` 新增 `clearQueues()` 並於 reset 時呼叫（BUG-06，FR-043）

**Checkpoint**: 七個缺陷皆有測試覆蓋且兩端測試綠燈

---

## Dependencies

### 階段相依

```
Phase 1 (Setup)
   └─▶ Phase 2 (Foundational) ── 阻塞全部 user story
          ├─▶ Phase 3 (US1) ── MVP
          │      └─▶ Phase 4 (US2) ── 需要 US1 的階段矩陣才能扣留金鑰
          │             ├─▶ Phase 5 (US3) ── 重來需重新取得密文與金鑰
          │             ├─▶ Phase 6 (US4) ── 離線路徑需要 wrappedExamKey
          │             └─▶ Phase 7 (US5) ── reset 需清除金鑰與密文
          └─▶ Phase 8 (US6) ── 只需 Phase 2，可與 US2 平行
                 └─▶ Phase 9 (Polish)
```

### 說明

- **US2 依賴 US1**：金鑰要「扣留到 `IN_PROGRESS`」，前提是階段矩陣已經在強制執行。
- **US3、US4、US5 依賴 US2**：三者都要處理密文與金鑰的取得或清除。
- **US6 只依賴 Phase 2**：助教介面的資訊補齊與加密無關，可與 US2 平行進行。
- **US4 與 US5 彼此獨立**，可平行。

### 跨 repo 相依

| Story | host | desktop | 佈署 |
|---|:---:|:---:|---|
| Phase 2 | ✓ | ✓ | 原子 |
| US1 | ✓ | ✓ | 原子 |
| US2 | ✓ | ✓ | 原子 |
| US3 | ✓ | ✓ | 原子 |
| US4 | ✓ | ✓ | 原子 |
| US5 | ✓ | ✓ | 原子 |
| US6 | ✓ | ✗ | host 單獨即可 |

---

## Parallel Execution Examples

### Phase 2

```
T006, T007, T008  ── 三份測試檔互不相干
T014, T015        ── 分屬兩個 repo
```

### Phase 3 (US1)

```
T018 ~ T024  ── 七份測試檔可同時撰寫
T031, T033, T038  ── model、store、api 三處互不相干
```

### Phase 4 (US2)

```
T045 ~ T052  ── 八份測試檔可同時撰寫（分屬三處，但共用同一份 fixture）
```

### Phase 5 (US3)

```
T073 ~ T077  ── 五份測試檔
T078 可與 T079 ~ T081 平行（model 變更 vs service 邏輯）
```

### 跨 story 平行

```
Phase 8 (US6) 可與 Phase 4 (US2) 同時進行 —— 兩者無共用檔案
```

---

## Implementation Strategy

### MVP（最小可交付）

**Phase 1 + Phase 2 + Phase 3 (US1)**

交付後系統已具備五個語意獨立的階段、單向轉移、後端強制的權限矩陣，以及監考端的準備狀況頁。考卷仍走舊的整份下發 —— **測資保護尚未生效**，因此 MVP 不可用於正式考試，僅供驗證階段骨架。

### 增量交付

| 增量 | 交付內容 | 可用於正式考試 |
|---|---|---|
| MVP（US1） | 階段骨架、註冊時機修正、準備狀況頁 | ✗ |
| + US2 | 測資保護生效 | ✓ 但重啟仍是死路 |
| + US3 | 重啟可恢復 | ✓ |
| + US4 | 後端不可用時仍能開考、斷線補送 | ✓ 建議至此再上線 |
| + US5 | reset 可用 | ✓ |
| + US6 | 助教判斷資訊完備 | ✓ |

**建議上線門檻**：US4 完成之後。在此之前雖然可用，但後端跳機會使全場無法開考 —— 而那正是本功能要解決的核心風險之一。

### 每個 Phase 的收尾條件

1. 該 Phase 的全部測試綠燈（兩個 repo）
2. quickstart.md §A 的契約 fixture `diff` 無差異
3. 執行一次 quickstart.md §B 六階段走查
4. 兩個 repo 的 PR 同時開啟並互相引用


---

## Phase 11: Increment Setup — 考前語言檢查（2026-10-15）

**Scope**：依 plan.md 增量章節、research.md R12–R15、data-model.md §11 與 contracts/environment-precheck-api.md。以下路徑沿用 host/、desktop/ 前綴，分別代表本 repo 與相鄰 desktop repo。新增測試是專案憲法與計畫的必要驗收。所有新任務目前未執行，不重做既有已完成的生命週期建置。

- [X] T148 確認 host 使用 feat/007-environment-precheck-plan、desktop 使用 feat 分支，記錄兩端基線 commit、工作區既有修改與本次驗證命令至 `host/specs/007-exam-lifecycle-state-machine/validation.md`；保留現有變更，不重設或覆寫既有工作
- [X] T149 建立 `host/backend/test/fixtures/exam-languages.fixture.json` 並逐位元組複製到 `desktop/test/fixtures/exam-languages.fixture.json`；包含合法全部語言／空集合、來源多題同語言的預期去重排序，以及未知值、缺欄、null、非陣列的無效回應樣本

## Phase 12: Increment Foundation — 型別與契約錨點

**Gate**：T149 完成後才能開始；T150–T152 可並行，全部完成後進入 US1。無新資料表或套件。

- [X] T150 [P] 在 `host/backend/src/schemas/exam-languages.schema.ts` 定義封包、有限 timestamp／非空 nonce、嚴格語言回應 schema 與推導型別，重用既有語言定義；以 `host/backend/test/unit/schemas/exam-languages.schema.test.ts` 驗證 T149 fixture，unknown 必須收窄，不新增 any
- [X] T151 [P] 在 `desktop/src/main/schemas/exam-languages.schema.ts` 定義對應 Zod 4 回應 schema，以 `desktop/test/service/exam-languages.schema.test.ts` 驗證 T149 fixture；未知語言不可靜默過濾成空集合，重複／順序違反回應契約須拒絕
- [X] T152 [P] 擴充 `host/scripts/check-contract-fixture.sh` 比對兩份語言 fixture，同時保留既有三份考卷 fixture 比對；在 `host/specs/007-exam-lifecycle-state-machine/contracts/fixture-maintenance.md` 記錄來源與同步規則，確認既有 package.json test 入口會執行檢查

## Phase 13: US1 — 註冊後背景檢查與 manage 警示 (P1，增量 MVP)

**Goal**：INITIALIZED 即取得語言並檢查；檢查與取得失敗都不阻擋合法登入／階段切換，manage 顯示真實回報。

**Independent Test**：後端維持 INITIALIZED、學生未登入，裝置註冊即自動檢查；缺工具鏈時可切至 SETUP_FINISHED 並登入，對應學生顯示 FAILED；修復後 retry 更新 PASSED（SC-015、SC-016）。

### Tests first

T153–T158 為不同檔案，可在 Foundation 完成後並行撰寫；先觀察新增行為測試失敗，再開始實作。

- [X] T153 [P] [US1] 在 `host/backend/test/integration/controllers/user/user-exam-languages.controller.test.ts` 撰寫真實 AES 封包測試：無學生 session 成功、去重排序、有效 []、缺設定／壞設定、未註冊、冒用 UUID、錯 key、壞 GCM、過期／重播 nonce、pure 模式仍驗證身分，以及讀取途中 reset／重註冊拒絕；對照契約逐項斷言 HTTP 與穩定 code
- [X] T154 [P] [US1] 擴充 `host/backend/test/unit/middlewares/exam-phase.middleware.test.ts` 的 languages 五階段矩陣，並在 `host/backend/test/integration/controllers/admin/admin-exam-state.controller.test.ts` 驗證 UNKNOWN/RUNNING/FAILED 不阻擋合法階段推進
- [X] T155 [P] [US1] 在 `desktop/test/service/api.service.test.ts` 與 `desktop/test/ipc/auth.ipc.test.ts` 測試無 session 的語言請求、嚴格解密回應驗證、成功註冊後只啟動一次背景取得，慢 API／檢查失敗不改變註冊成功或拖住登入
- [X] T156 [P] [US1] 擴充 `desktop/test/service/environment-check.service.test.ts`：null 與 [] 區分、未知資料失敗、單次執行、快照 retry 不依賴完整考卷、首次取得失敗可重抓、RUNNING→終態序列回報、HTTP 或應用 success 失敗保留最新結果、重試使用新 nonce
- [X] T157 [P] [US1] 在 `desktop/test/ui/environment-check-route.test.ts` 與 `desktop/test/ui/environment-check.ui-mapping.test.ts` 驗證 FETCHING/RUNNING/FAILED/UNKNOWN 不阻擋已獲階段及身分許可的登入，且待命頁呈現取得／檢查失敗；INITIALIZED 仍無學生登入入口
- [X] T158 [P] [US1] 擴充 `host/backend/test/integration/controllers/user/user-environment-report.controller.test.ts`、`host/backend/test/integration/controllers/admin/admin-readiness.controller.test.ts` 與 `host/frontend/test/student-readiness.test.ts`：回報儲存與 student 更新通知、綁定後顯示原裝置結果、FAILED 優先於已登入、UNKNOWN/RUNNING 不算 ready、retry PASSED 清除警示；未綁學生不可猜配

### Implementation

- [X] T159 [US1] 在 `host/backend/src/services/exam.service.ts` 新增嚴格裝置請求解碼路徑，使用 T150 型別、既有 crypto/replay 驗證，回傳可識別註冊實例的已驗證上下文；不沿用 any 或 pure bypass，新錯誤對應契約 code，既有 config/key/report 呼叫若重構須保留回歸（依賴 T153）
- [X] T160 [US1] 在 `host/backend/src/services/exam.service.ts` 實作由目前有效 exam_config 投影去重語言、固定排序及加密回應；缺設定不回 []，不得附帶其他考卷欄位，回應前檢查註冊實例／場次有效性（依賴 T159）
- [X] T161 [US1] 在 `host/backend/src/controllers/user/user.controller.ts`、`host/backend/src/routes/user/user-exam.route.ts` 掛載 POST /user/exam/languages，於 `host/backend/src/middlewares/exam-phase.middleware.ts` 僅開放 INITIALIZED／SETUP_FINISHED／IN_PROGRESS；跑 T153、T154（依賴 T160）
- [X] T162 [US1] 在 `desktop/src/main/services/api.service.ts` 新增裝置加密 getExamLanguages client，無 session 要求，驗證封包與 T151 schema、對應錯誤碼，重試產生新 timestamp/nonce（依賴 T155；可在後端實作期間用 fixture 驗證）
- [X] T163 [US1] 在 `desktop/src/main/services/environment-check.service.ts` 與 `desktop/src/main/services/ramStore.service.ts` 實作 data-model.md §11 的語言快照、來源、取得狀態與 run／registration 世代；新增 typed applyLanguages，重用既有 runner，單一執行，取得失敗可重試且 [] 只在有效回應後通過（依賴 T156、T162）
- [X] T164 [US1] 在 `desktop/src/main/ipc/auth.ipc.ts` 成功註冊後啟動不 await 完成的背景取得與檢查，捕捉錯誤呈現本機狀態；`desktop/src/main/ipc/environment-check.ipc.ts` 的 retry 改用快照或重新取得未成功的清單，不依賴解密考卷（依賴 T163）
- [X] T165 [US1] 在 `desktop/src/main/services/config.service.ts` 分離線上取卷與環境檢查，不再 await／觸發 applyMeta；`desktop/src/main/services/message-sync.service.ts` 的 config_update 維持取卷但不刷新線上快照，普通登入／重連也不刷新；離線檔案仍由 meta 觸發既有檢查（依賴 T164，FR-045、FR-049）
- [X] T166 [US1] 在 `desktop/src/renderer/router/environment-check.guard.ts` 與 `desktop/src/renderer/router/index.ts` 移除環境狀態對登入的 veto，保留階段／身分／設定頁限制；核對 `desktop/src/renderer/pages/StandbyPage.vue` 與 `desktop/src/renderer/components/environment-check.presentation.ts` 能呈現取得失敗並重試，只修缺失接線（依賴 T157、T165）
- [X] T167 [US1] 在 `desktop/src/main/services/environment-check.service.ts` 實作單一序列回報者，每 run 一次 RUNNING 與終態，只留最新待報狀態並確認 HTTP／應用 success；綁定裝置與 run 世代，完整診斷不送後端，本機失敗不阻擋操作（依賴 T163；修改同檔須接續，不與 T163 並行）
- [X] T168 [US1] 在 `host/backend/src/controllers/user/user.controller.ts` 與 `host/backend/src/services/device.service.ts` 將環境回報更新限制在原驗證的註冊實例，處理驗證後同 UUID 重註冊競態；保留既有環境欄位及 student 更新通知，不新增登入或階段 gate（依賴 T158、T159、T161）
- [X] T169 [US1] 以 T158 測試核對 `host/backend/src/controllers/admin/admin-readiness.controller.ts`、`host/frontend/src/stores/readiness.store.ts` 與 `host/frontend/src/views/manage/components/StudentReadiness.vue` 全鏈；僅修失敗顯示／刷新缺陷，保留未綁學生語意，將 INITIALIZED→檢查→登入→FAILED→retry PASSED 驗證結果寫入 `host/specs/007-exam-lifecycle-state-machine/validation.md`（依賴 T166–T168）

## Phase 14: US2 — 語言資訊不洩漏考卷 (P1，回歸)

**Goal / Independent Test**：開考前取得語言，只能讀到清單，不能讀到題目、測資、口令或金鑰；原考卷解密流程仍正確。

- [X] T170 [US2] 在 `host/backend/test/integration/controllers/user/user-exam-languages.controller.test.ts` 加入完整考卷 sentinel 測資並斷言解密回應精確只有 languages；確認不得由 config/key 路由繞過階段保護（依賴 T161，與 T153 同檔須依序）
- [X] T171 [US2] 在 `desktop/test/service/config.service.test.ts` 驗證線上取得／更新密文考卷不重新檢查、不等待 runner，examConfig 開考前仍 null；若回歸失敗修正 `desktop/src/main/services/config.service.ts` 並重跑既有解密測試（依賴 T165、T170）

## Phase 15: US3 — 重啟取得最新語言 (P1)

**Goal / Independent Test**：原入場期間語言不刷新；重啟並經合法入場後取得最新清單、重檢且已提交作答不變（SC-017）。

- [X] T172 [US3] 在 `desktop/test/ipc/auth.ipc.test.ts` 與 `desktop/test/service/environment-check.service.test.ts` 測試語言變更後普通重連／config_update／retry 仍使用舊快照，重啟的新 session 才取得新值；SETUP_FINISHED／IN_PROGRESS 的重新入場須經既有助教核准（依賴 T169、T171）
- [X] T173 [US3] 在 `desktop/src/main/ipc/auth.ipc.ts` 與 `desktop/src/main/services/ramStore.service.ts` 接通重來／換後端／註冊身分失效的統一清理入口，取消舊工作並清快照，成功重新入場後重取；不得清除已提交作答或改寫既有審核規則，跑 T172（依賴 T172）

## Phase 16: US4 — 斷線補送與離線檔案 (P2)

**Goal / Independent Test**：報告傳送時斷線，本機結果仍可見，恢復後 manage 收到最新終態；完全離線檔案檢查及口令開考可用。

- [X] T174 [US4] 在 `desktop/test/service/connection.service.test.ts`、`desktop/test/service/message-sync.service.test.ts` 與 `desktop/test/service/config.service.test.ts` 測試初次取語言失敗後重連重試、成功快照不刷新、最新回報補送、完全離線不呼叫 API／上報，且仍可口令開考（依賴 T173）
- [X] T175 [US4] 在 `desktop/src/main/services/connection.service.ts` 與 `desktop/src/main/services/message-sync.service.ts` 的連線恢復接入有效世代的初次取得重試／待回報重送，避免重複 listener 與同時送出；保留既有作答補送順序及離線模式，跑 T174（依賴 T174、T167）

## Phase 17: US5 — reset 不被舊檢查污染 (P2)

**Goal / Independent Test**：刻意延遲語言回應、runner 與回報後 reset，再初始化同 UUID；舊結果不得出現在新場次。

- [X] T176 [US5] 在 `desktop/test/service/message-sync.service.test.ts` 與 `host/backend/test/integration/controllers/user/user-environment-report.controller.test.ts` 測試 reset 途中取得／runner／待送／已驗證未寫入回報的競態，以及同 UUID 新 key 註冊後拒絕舊回報（依賴 T175、T168）
- [X] T177 [US5] 在 `desktop/src/main/services/message-sync.service.ts`、`desktop/src/main/services/ramStore.service.ts` 的 reset 先停止 runner 並遞增世代再清資料，所有舊完成回呼與待送報告失效；修正 T176 發現的 `host/backend/src/services/device.service.ts` 條件更新缺口並跑回歸（依賴 T176、T173）

## Phase 18: US6 — 助教審核仍有效 (P3，回歸)

**Goal / Independent Test**：設定完成後重啟仍待審，核准後取語言／檢查；即使失敗也可合法登入，manage 警示與三種入場情境仍正常。

- [ ] T178 [US6] 擴充 `host/backend/test/integration/controllers/admin/connection.controller.test.ts` 與 `desktop/test/ipc/auth.ipc.test.ts` 的核准重新入場回歸，確認語言 API 不自動核准、不改綁定／位置規則，核准後檢查失敗不撤銷入場；把 quickstart.md F3 核准走查結果記入 `host/specs/007-exam-lifecycle-state-machine/validation.md`（依賴 T177）

## Phase 19: Increment Polish & Cross-Cutting

- [ ] T179 執行 `host/specs/007-exam-lifecycle-state-machine/quickstart.md` F1 的 fixture、兩端型別與完整測試、backend/frontend coverage，另於 desktop 執行 npx vitest run --coverage；確認新增／修改路徑 100% 行覆蓋，將命令／結果／既有缺口寫入 `host/specs/007-exam-lifecycle-state-machine/validation.md`，失敗須修復後重跑（依賴 T178）
- [ ] T180 執行 `host/specs/007-exam-lifecycle-state-machine/quickstart.md` F2–F4 真機案例與受影響 B/C/D 回歸，保存前後狀態、步驟、環境資訊到 `host/specs/007-exam-lifecycle-state-machine/validation.md`；runtime 測試略過不可算通過，未完成現場項目保持未勾選（依賴 T179；可與既有 T119–T121 共用驗收證據）
- [ ] T181 更新 `host/EXAM-LIFECYCLE.md` 的語言取得與提示式檢查流程，於 `host/specs/007-exam-lifecycle-state-machine/quickstart.md` 記錄兩端共同部署版本及「變更語言須重啟」作業，核對 `host/specs/007-exam-lifecycle-state-machine/tasks.md` 的 FR/SC 覆蓋與完成證據；不得把未執行的舊驗收一併勾選（依賴 T180）

## 增量依賴與並行執行

```text
T148 → T149 → [T150 || T151 || T152]
  → US1 tests [T153 || T154 || T155 || T156 || T157 || T158]
  → backend T159 → T160 → T161 → T168
  → desktop T162 → T163 → T164 → T165 → T166 → T167
  → T169 → US2 T170 → T171 → US3 T172 → T173
  → US4 T174 → T175 → US5 T176 → T177 → US6 T178
  → T179 → T180 → T181
```

後端 T159–T161 與桌面版 T162–T167 可依共同 fixture 同步實作；T168 與桌面版實作分屬不同 repo，可同時進行。所有共用同一檔案的任務須依序，箭頭表示本次建議執行順序，不代表舊 stories 要重做。

| Story | 可並行範例／限制 |
|---|---|
| US1 | T153–T158 六組互不覆蓋的測試檔；後端與桌面版實作各自一條線 |
| US2 | T170 可在 T161 完成後與桌面版 T163–T167 並行；T171 須等 T165 |
| US3 | T172–T173 共用 auth／環境服務，依序，不強行並行 |
| US4 | T174–T175 會改 message-sync/config 回歸，依序 |
| US5 | T176 的後端競態測試可與該任務的桌面版測試分開執行；T177 須待測試就緒 |
| US6 | T178 涉及前述 auth 測試檔，安排最後避免衝突 |

## 增量需求覆蓋與交付策略

| 需求 | 任務 | 驗收 |
|---|---|---|
| FR-044、FR-048 | T149–T162、T170 | 裝置驗證語言端點、五階段矩陣、無內容洩漏 |
| FR-045／SC-015 | T155–T157、T163–T166 | INITIALIZED 自動啟動且不等待登入 |
| FR-046 | T154、T157、T164–T166 | 檢查不阻擋合法登入或階段轉移 |
| FR-047／SC-016 | T158、T167–T169、T174–T177 | report → 裝置 → readiness → UI，重試更新與防舊結果污染 |
| FR-049／SC-017 | T165、T171–T173、T178 | 原快照不刷新、重啟後取新值並保留審核 |
| 舊 US2–US6 回歸 | T170–T178 | 保密、重來、離線、reset、助教入場 |

**最小可驗證增量（MVP）**：Phase 11–13，即 US1 的「註冊→語言→檢查→提示」。可在測試環境驗證，不以只完成 API 代表完整功能完成。

**正式交付門檻**：Phase 14–19 回歸與真機驗收完成，兩端共同部署；原有 T117–T126 保持各自完成標準。本次不新增 PR 任務，避免重複既有 T126；不在任務產生階段開 PR、實作或宣稱測試通過。

本次追加 **34 項（T148–T181）**：Setup/Foundation 5、US1 17、US2 2、US3 2、US4 2、US5 2、US6 1、Polish 3。全檔 181 項，原有 137 項完成、44 項未完成（舊 10＋新 34）。

## 實作追加：分析發現修正

- [X] T182 為兩端新增 quality workflow：全 src coverage 100% gate、獨立安全 audit job；補 60 請求併發驗證、sequence 原子條件更新及舊資料庫 additive migration 測試。修正計畫的舊任務註記並記錄實際 gate 失敗。

**2026-10-15 實作狀態**：T148–T177 與 T182 完成。新增測試部分集中於 `desktop/test/service/environment-precheck.test.ts`，涵蓋原 T156/T172/T174/T176 的服務生命週期案例；不要求重複分散至舊測試檔。證據及未完成範圍見 [validation.md](validation.md)。T178–T181 尚未滿足全部驗收條件；T181 文件已更新。原 T117–T126 不變。目前 182 項，168 完成、14 未完成。
