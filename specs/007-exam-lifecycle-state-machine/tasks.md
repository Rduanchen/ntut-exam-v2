---
description: "Task list for feature 007 — exam lifecycle state machine and paper encryption"
---

# Tasks: Exam Lifecycle State Machine and Paper Encryption

**Input**: Design documents from `/specs/007-exam-lifecycle-state-machine/`

**Prerequisites**: plan.md, spec.md, design.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 依憲法（100% 測試覆蓋率）為**必要**，每個 user story 皆先寫測試。

**Organization**: 依 user story 分組。每個 story 可獨立驗證，但**多數 story 同時橫跨兩個 repo** —— 見下方「跨 repo 佈署」。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、無未完成相依）
- **[Story]**: 對應 spec.md 的 user story

## Path Conventions

本功能橫跨兩個獨立 repo，路徑一律加上 repo 前綴：

- `host/` → `~/Documents/ntut-exam-v2/host`，分支 `feat/007-exam-lifecycle-state-machine`
- `desktop/` → `~/Documents/ntut-exam-v2/desktop`，分支 `feat/003-exam-lifecycle-state-machine`

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
- [ ] T048 [P] [US2] 在 `host/backend/test/unit/schemas/config.schema.test.ts` 以 `host/backend/test/fixtures/exam-config-payload.fixture.json` 驗證 `meta`／`secret`／`wrappedExamKey` schema
- [ ] T049 [P] [US2] 在 `desktop/test/service/examConfig.schema.test.ts` 以 `desktop/test/fixtures/exam-config-payload.fixture.json` 驗證桌面版對應 schema（zod ^4 行為差異在此暴露）
- [ ] T050 [P] [US2] 在 `desktop/test/service/config-merge.test.ts` 測試 `mergeExamConfig(meta, secret)` 的結果通過既有 `examConfigSchema`，且 `puzzle.id` 集合不一致時拋錯
- [ ] T051 [P] [US2] 在 `host/frontend/test/config-schema.test.ts` 以 `host/frontend/test/fixtures/exam-config-payload.fixture.json` 驗證 `frontend/src/types/config.ts` 的 `ExamConfig`（三份定義的第三份）

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
- [ ] T062 [US2] 在 `desktop/src/main/schemas/examConfig.schema.ts` 新增 meta/secret/wrappedExamKey schema 並實作 `mergeExamConfig()`
- [ ] T063 [US2] 在 `desktop/src/main/services/ramStore.service.ts` 新增 `examConfigMeta`、`examConfigCipher`、`examKey` 欄位，`examConfig` 維持既有形狀且**開考前為 `null`**（data-model.md §5、research.md R10）
- [ ] T064 [US2] 在 `desktop/src/main/services/crypto.service.ts` 新增 `K_exam` 解密 cipher 的函式
- [ ] T065 [US2] 在 `desktop/src/main/services/config.service.ts` 改為接收 `{ meta, cipher }`，僅以 meta 觸發環境檢查
- [ ] T066 [US2] 在 `desktop/src/main/services/message-sync.service.ts` 收到 `IN_PROGRESS` 廣播後呼叫 `POST /user/exam/key`，取得金鑰後解密並合併（contracts/ G19）
- [X] T067 [US2] 確認 `host/backend/src/sockets/message-socket.service.ts` 的開考廣播不含金鑰或任何可導出金鑰的資訊（contracts/ G10）
- [ ] T068 [P] [US2] 在 `host/frontend/src/types/config.ts` 的 `ExamConfig` 新增 `submitGraceSeconds`（該檔既有註解已記錄 004 的同類漂移事故）
- [ ] T069 [P] [US2] 在 `host/frontend/src/stores/config.store.ts` 的預設 config 加入 `submitGraceSeconds: 60`
- [ ] T070 [US2] 在 `host/frontend/src/views/config/components/GeneralSettingsEditor.vue` 新增 `submitGraceSeconds` 表單欄位（收卷緩衝秒數）
- [ ] T071 [US2] 在 `host/frontend/src/views/config/components/GeneralSettingsEditor.vue` 改寫 `startPassword` 的標籤與說明 —— 它已由「開考的 UI 閘門」變更為「考卷解密金鑰」，管理員必須知道這個語意改變
- [ ] T072 [US2] 在 `host/frontend/src/views/config/components/ConfigForm.vue` 加入口令弱度警告與二次確認（少於 6 字元），警告文字須說明考卷在開考前的保護強度等同於此口令（research.md R4）

**Checkpoint**: 開考前 0 筆測資可讀（SC-001）。下游程式碼應 0 處修改（SC-009）。

---

## Phase 5: User Story 3 — 機器重啟後能回到考試 (P1)

**Goal**: 機器重啟後，經一次助教核准即可回到考試，已提交的作答自動復原。

**Independent Test**: 考試中重啟一台機器，走完重新入場流程，確認回到考試畫面且已提交作答 100% 復原（quickstart.md B-18 ~ B-22）。

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T073 [P] [US3] 在 `host/backend/test/unit/services/device.service.test.ts` 測試被拒絕的註冊請求**不修改** `DeviceKeyMap` 任何欄位，特別是既有裝置的 `status`（contracts/ G13）
- [ ] T074 [P] [US3] 在同檔測試同一 `deviceUuid` 連送三次註冊只產生一筆 `PENDING` 申請（contracts/ G14）
- [ ] T075 [P] [US3] 在同檔測試三種申請分類的判別：`NEW_DEVICE` / `REBIND` / `UNBOUND_DEVICE`（research.md R3）
- [ ] T076 [P] [US3] 在 `host/backend/test/integration/controllers/admin/connection.controller.test.ts` 測試 `POST /admin/device/:uuid/re-entry` 清除裝置身分但**不觸及** `Submission` 與 `ScoreBoard`（contracts/ G18）
- [ ] T077 [P] [US3] 在 `desktop/test/ipc/auth.ipc.test.ts` 測試重啟後（無 `cryptoState`）走註冊申請路徑，而非直接失敗

### Implementation for User Story 3

- [ ] T078 [P] [US3] 在 `host/backend/src/models/login-request.model.ts` 將 `type` 值域改為 `NEW_DEVICE / REBIND / UNBOUND_DEVICE`，新增 `previousTestId`
- [ ] T079 [US3] 在 `host/backend/src/services/device.service.ts` 移除 throw 403 之前對 `existing.status` 的寫入（spec.md FR-010）
- [ ] T080 [US3] 在 `host/backend/src/services/device.service.ts` 依 data-model.md §7 的判別條件分類三種申請並填入 `previousTestId`
- [ ] T081 [US3] 在 `host/backend/src/services/device.service.ts` 的申請建立加入去重檢查（contracts/ G14）
- [ ] T082 [US3] 在 `host/backend/src/services/binding.service.ts` 新增 `reEntry(deviceUuid)`：`forceLogoutDevice` 加 `unregisterDevice`，明確不觸及成果層
- [ ] T083 [US3] 在 `host/backend/src/controllers/admin/connection.controller.ts` 與 `host/backend/src/routes/admin/connection.route.ts` 新增 `POST /admin/device/:deviceUuid/re-entry`
- [ ] T084 [US3] 在 `desktop/src/main/ipc/auth.ipc.ts` 讓註冊失敗回 `entry_pending` 時進入待審畫面，而非清空 `cryptoState` 後失敗
- [ ] T085 [US3] 建立 `desktop/src/renderer/pages/PendingApprovalPage.vue`（待審畫面），輪詢核准狀態
- [ ] T086 [US3] 在 `desktop/src/renderer/router/index.ts` 將待審畫面納入推導表
- [ ] T087 [US3] 確認 `desktop/src/main/ipc/auth.ipc.ts` 登入後的 `getSubmissions` 復原流程在重來路徑上同樣執行（spec.md US3-2）

**Checkpoint**: 目前 100% 重現的重啟死路已修復（SC-002）。

---

## Phase 6: User Story 4 — 後端不可用時考試仍能開始與進行 (P2)

**Goal**: 開考不依賴後端可用；斷線期間作答不受影響且恢復後自動補送。

**Independent Test**: 關閉後端，僅以口令讓一台機器開考並完整作答到底（quickstart.md C-7 ~ C-10）。

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T088 [P] [US4] 在 `host/backend/test/unit/services/exam-config-crypto.service.test.ts` 測試兩條路徑導出的金鑰**逐位元組相同**（contracts/ G27）
- [ ] T089 [P] [US4] 在 `desktop/test/service/crypto.service.test.ts` 測試錯誤口令解不開 `wrappedExamKey`，且考卷維持不可讀
- [ ] T090 [P] [US4] 在 `desktop/test/service/connection.service.test.ts` 測試待送佇列：斷線期間累積、恢復後依序重送、失敗放回佇列不丟棄（data-model.md §9）
- [ ] T091 [P] [US4] 在 `desktop/test/service/connection.service.test.ts` 測試同一題目重複提交以最後一筆為準，佇列不無限成長
- [ ] T092 [P] [US4] 在 `desktop/test/service/config.service.test.ts` 測試離線佈署檔與線上回應共用同一套解析（contracts/ G22）

### Implementation for User Story 4

- [ ] T093 [US4] 在 `desktop/src/main/services/crypto.service.ts` 實作 PBKDF2-HMAC-SHA256 600,000 迭代導出並解開 `wrappedExamKey`（research.md R2）
- [ ] T094 [US4] 改寫 `desktop/src/renderer/pages/WaitingForExamPage.vue`：口令由「與 config 明文比對」改為「導出金鑰並解密考卷」，成功才進入考試
- [ ] T095 [US4] 在 `desktop/src/main/services/connection.service.ts` 以 `pendingSubmissions` 與 `pendingScores` 佇列取代 `pendingTestResult` / `pendingProgramFile` 旗標（data-model.md §9）
- [ ] T096 [US4] 在 `desktop/src/main/services/connection.service.ts` 的 `onConnectionRestored` 依 data-model.md §9 的順序重送，失敗項目放回佇列
- [ ] T097 [US4] 在 `desktop/src/main/services/judge-manager.service.ts` 將評測結果與程式碼提交在斷線時推入佇列而非只設旗標
- [ ] T098 [P] [US4] 在 `host/backend/src/controllers/admin/exam-config.controller.ts` 新增離線佈署檔匯出端點，輸出 `{ meta, cipher }`（contracts/ §8）
- [ ] T099 [P] [US4] 在 `host/frontend/src/views/config/ConfigView.vue` 加入匯出按鈕與口令保管提示
- [ ] T100 [US4] 在 `desktop/src/main/services/config.service.ts` 將 `setConfigFromFile` 改為接受 `{ meta, cipher }` 佈署檔，**移除明文完整考卷的載入路徑**（contracts/ G24）
- [ ] T101 [US4] 在 `desktop/src/main/services/ramStore.service.ts` 將 `isOfflineMode` 的判定改為「是否曾成功完成裝置註冊」（spec.md FR-028、data-model.md §8）

**Checkpoint**: 後端完全不可用時仍有 100% 機器能開考（SC-003）。

---

## Phase 7: User Story 5 — 全域 reset 讓系統乾淨回到起點 (P2)

**Goal**: reset 後所有機器不殘留任何舊考試的身分或考卷，且可立即重新入場。

**Independent Test**: 考試中執行 reset，確認所有機器回到等待畫面且不殘留資料，接著重新初始化並讓同一批機器完成註冊（quickstart.md B-25 ~ B-27）。

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T102 [P] [US5] 在 `host/backend/test/integration/controllers/admin/exam-config.controller.test.ts` 測試 reset 清除 `exam_key`、`exam_config_cipher`、`exam_config_meta`
- [ ] T103 [P] [US5] 在同檔測試 reset 廣播 `exam-reset` 獨立事件，且**不寫入** `Message` 表（contracts/ G20/G21）
- [ ] T104 [P] [US5] 在 `desktop/test/service/message-sync.service.test.ts` 測試收到 `exam-reset` 後 data-model.md §8 標示為「清」的欄位全數清空

### Implementation for User Story 5

- [ ] T105 [US5] 在 `host/backend/src/sockets/message-socket.service.ts` 新增 `sendExamReset()`，發送獨立的 `exam-reset` 事件
- [ ] T106 [US5] 在 `host/backend/src/services/init.service.ts` 的 `wipeAllData` 加入清除三個新 `SystemSettings` 鍵，並改為呼叫 `sendExamReset()` 而非一般階段廣播
- [ ] T107 [US5] 在 `host/backend/src/services/init.service.ts` 將 reset 的階段設定與 `changeState` 的程式路徑分離（contracts/ G6）
- [ ] T108 [US5] 在 `desktop/src/main/services/ramStore.service.ts` 新增 `clearForReset()`，依 data-model.md §8 清除全部標示項目，含 `localProgramStore` 暫存目錄
- [ ] T109 [US5] 在 `desktop/src/main/services/message-sync.service.ts` 監聽 `exam-reset` 並呼叫 `ramStore.clearForReset()`，隨後導向等待畫面

**Checkpoint**: reset 後重新註冊成功率 100%（SC-005）。

---

## Phase 8: User Story 6 — 助教能判斷並處理入場例外 (P3)

**Goal**: 助教在單一畫面即可區分三種入場情境並完成處置，換機只需一次核准。

**Independent Test**: 製造三種入場情境，確認監考端能分別辨識，且換機情境只需一次核准（quickstart.md B-19）。

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T110 [P] [US6] 在 `host/backend/test/integration/controllers/admin/connection.controller.test.ts` 測試 `GET /admin/connection/requests` 回傳 contracts/ §6 的全部判斷欄位
- [ ] T111 [P] [US6] 在同檔測試 `approve` 帶 `targetTestId` 時**同一次呼叫**解除兩邊綁定（contracts/ G17）
- [ ] T112 [P] [US6] 在同檔測試 `reject` 後裝置與學生狀態完全不變（spec.md US6-3）

### Implementation for User Story 6

- [ ] T113 [US6] 在 `host/backend/src/controllers/admin/connection.controller.ts` 的 `getRequests` join 出原綁學生姓名、是否他機在線、`lastDisconnectedAt`、IP 是否與名單相符
- [ ] T114 [US6] 在 `host/backend/src/controllers/admin/connection.controller.ts` 的 `approveRequest` 接受 `targetTestId`，依 contracts/ G17 解除兩邊綁定並回傳 `unbound`
- [ ] T115 [P] [US6] 在 `host/frontend/src/views/connection/ConnectionView.vue` 依三種情境分組呈現待審清單並顯示判斷資訊
- [ ] T116 [US6] 在 `host/frontend/src/views/connection/ConnectionView.vue` 的核准對話框加入「這台機器接下來給哪個學號」的選擇

**Checkpoint**: 助教不需查詢其他畫面即可判斷（SC-007）。

---

## Phase 9: Polish & Cross-Cutting

- [ ] T117 [P] 在 `host/backend/src/services/exam-state.service.ts` 與 `desktop` 兩端確認 `ExamPhase` 五值完全一致，無殘留的 `NOT_STARTED` 字串
- [ ] T118 [P] 執行 quickstart.md §A 全部自動化驗證，確認兩端測試皆綠且 fixture `diff` 無差異
- [ ] T119 執行 quickstart.md §B 六階段人工走查 27 步，**第 6、10、26 步不可省**
- [ ] T120 執行 quickstart.md §C 全程離線走查 11 步
- [ ] T121 執行 quickstart.md §D 安全性驗證 7 項
- [ ] T122 執行 quickstart.md §E 回歸驗證，確認 judger／UI／special rules 的既有測試 0 處修改（SC-009）
- [ ] T123 [P] 量測 `POST /user/exam/key` 與 `POST /user/exam/config` 的回應大小比例，確認小於 1%（SC-004）
- [ ] T124 [P] 更新 `host/knowledge/vision.md` 的目前狀態與里程碑
- [ ] T125 [P] 將本功能的教訓寫入 `host/knowledge/experience.md`（跨 repo 契約、扣留金鑰的設計取捨）
- [ ] T126 在兩個 repo 各開 PR，描述互相引用並註明「必須同時 merge」

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
