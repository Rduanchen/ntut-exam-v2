# Tasks: 管理介面繁體中文用語統一

**Input**: Design documents from `specs/010-unify-zh-tw-ui/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [介面文字契約](contracts/admin-ui-copy.md), [quickstart.md](quickstart.md)

**Tests**: 專案憲法要求測試。各故事先加入能驗證使用者可見結果與行為的測試，確認失敗後再修改文案；不為單純常值複製無意義測試。

**Organization**: 依使用者情境分階段；所有路徑均相對於倉庫根目錄。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 在不碰觸既有 feature 009 未提交工作的前提下準備本功能。

- [X] T001 以 `specs/010-unify-zh-tw-ui/plan.md` 記載的 `feat/010-unify-zh-tw-ui` 建立隔離工作樹，帶入 `specs/010-unify-zh-tw-ui/` 文件並使新工作樹的 `.specify/feature.json` 指向此規格；保留原工作樹的 feature 009 修改。
- [X] T002 逐一檢查 `frontend/src/App.vue`、`frontend/src/views/`、`frontend/src/components/SubmissionDetails.vue`、`frontend/src/stores/` 與 `frontend/index.html`，在 `specs/010-unify-zh-tw-ui/copy-inventory.md` 列出九區域的可見文字、情境、來源、建議譯名及保留英文理由。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 先確定跨頁譯名與值／顯示邊界，避免各故事互相改出不同稱呼。

**⚠️ CRITICAL**: T003–T004 完成後才能修改使用者可見文案。

- [X] T003 依 `specs/010-unify-zh-tw-ui/copy-inventory.md` 定稿導覽、動作、設備、考試階段、評測、警告與設定來源譯名，補到 `specs/010-unify-zh-tw-ui/contracts/admin-ui-copy.md`；明列 `CONFIRM`、IP、UUID、JSON、CSV、評測代碼與原始診斷的例外。
- [X] T004 檢查 `frontend/src/types/`、`frontend/src/stores/`、`frontend/src/router/index.ts` 的資料值與顯示值邊界，在 `specs/010-unify-zh-tw-ui/copy-inventory.md` 標出不能翻譯的列舉值、路由、事件、識別碼及使用者資料。

**Checkpoint**: 用語表及保留值清冊可供三個故事共同採用。

---

## Phase 3: User Story 1 - 以一致的繁體中文瀏覽管理介面 (Priority: P1) 🎯 MVP

**Goal**: 九個導覽區域的固定一般文案、表單、表格及頁面名稱採一致台灣繁體中文。

**Independent Test**: 開啟九個主要路由與子畫面，導覽、標題、欄位、動作及一般說明可用中文理解；必要英文符合文字契約，路由與資料值不變。

### Tests for User Story 1

- [X] T005 [US1] 在 `frontend/test/ui-copy-navigation.test.ts` 增加管理端導覽與主要頁面標題的可見文字測試，先確認英文現況使測試失敗。
- [X] T006 [P] [US1] 在 `frontend/test/ui-copy-forms.test.ts` 增加考試設定表單與設備／連線欄位的中文標籤、選項及保留術語測試，先確認測試失敗。

### Implementation for User Story 1

- [X] T007 [US1] 將 `frontend/src/App.vue` 的九個導覽名稱、管理端標題及固定警告周邊文案翻成契約用語，並將 `frontend/index.html` 的頁面語言與標題改為繁體中文。
- [X] T008 [P] [US1] 翻譯 `frontend/src/views/config/ConfigView.vue`、`frontend/src/views/config/components/ConfigForm.vue`、`frontend/src/views/config/components/GeneralSettingsEditor.vue` 的固定標題、表單標籤、提示與匯入／匯出動作，保留 JSON、CSV、ms、MB 與設定鍵。
- [X] T009 [P] [US1] 翻譯 `frontend/src/views/config/components/PuzzleListEditor.vue`、`SectionListEditor.vue`、`SubtaskListEditor.vue`、`TestCaseEditor.vue`、`SpecialRuleEditor.vue` 的固定題目、測資、規則與選項文案，保留規則值及使用者輸入。
- [X] T010 [P] [US1] 翻譯 `frontend/src/views/judge/JudgeSettingsView.vue`、`frontend/src/views/judge/components/JudgeSettingsPanel.vue`、`SettingRow.vue`、`ContainerPanel.vue`、`HealthPanel.vue` 的一般設定文案，保留設定鍵、檔名與 Piston 名稱。
- [X] T011 [P] [US1] 翻譯 `frontend/src/views/judge/components/DeployTestPanel.vue`、`DeployTestProfileForm.vue`、`DeployTestConcurrencyResults.vue`、`RehearsalPanel.vue` 的一般操作與說明文案；高風險確認警告留給 US3。
- [X] T012 [P] [US1] 翻譯 `frontend/src/views/score/ScoreView.vue`、`frontend/src/views/score/components/ScoreTable.vue`、`SubmissionModal.vue`、`frontend/src/components/SubmissionDetails.vue` 的欄位與一般操作文字，保留評測代碼及作答原文。
- [X] T013 [P] [US1] 翻譯 `frontend/src/views/student/StudentView.vue`、`frontend/src/views/student/components/StudentList.vue`、`StudentDetails.vue`、`CodeViewer.vue` 的固定文案，保留姓名、學號與程式碼。
- [X] T014 [P] [US1] 翻譯 `frontend/src/views/anticheat/AnticheatView.vue`、`frontend/src/views/anticheat/components/AnticheatFilterBar.vue`、`AnticheatTable.vue`、`CheatSummaryStats.vue`、`frontend/src/views/log/LogView.vue`、`frontend/src/views/log/components/LogFilterBar.vue`、`LogTable.vue` 的固定文案，保留警告及日誌原始值。
- [X] T015 [P] [US1] 翻譯 `frontend/src/views/connection/ConnectionView.vue`、`frontend/src/views/device/DeviceView.vue`、`frontend/src/views/device/components/DeviceGrid.vue` 的標題、欄位、一般操作與提示；高風險解除綁定對話框留給 US3。
- [X] T016 [P] [US1] 翻譯 `frontend/src/views/manage/ManageView.vue`、`frontend/src/views/manage/components/MessageBroadcastForm.vue`、`StudentReadiness.vue` 的一般標題與操作文字，保留管理員輸入的廣播內容。
- [X] T017 [US1] 更新 `frontend/test/judge-settings-view.test.ts`、`frontend/test/editing-ui.test.ts`、`frontend/test/deploy-test-view.test.ts` 中依賴英文一般文案的斷言，保留檢查實際設定值與操作的斷言。
- [X] T018 [US1] 依 `specs/010-unify-zh-tw-ui/copy-inventory.md` 與 `specs/010-unify-zh-tw-ui/contracts/admin-ui-copy.md` 對照九區域一般文案，在清冊逐項記錄完成或必要英文例外，執行 `frontend/test/ui-copy-navigation.test.ts` 與 `frontend/test/ui-copy-forms.test.ts`。

**Checkpoint**: US1 可單獨展示九區域的繁體中文主要操作流程。

---

## Phase 4: User Story 2 - 以中文理解狀態與異常 (Priority: P2)

**Goal**: 載入、空白、結果及錯誤文案可理解，同時保持原始代碼、診斷與學生／系統歸因。

**Independent Test**: 在有資料、空資料、載入、已知與未知失敗情境核對中文狀態；原始值、診斷及歸因保持正確。

### Tests for User Story 2

- [X] T019 [US2] 在 `frontend/test/ui-copy-status.test.ts` 增加設備、評測、設定來源與未知值的可見狀態測試，確認原碼與歸因資訊不丟失，先確認測試失敗。
- [X] T020 [P] [US2] 在 `frontend/test/ui-copy-errors.test.ts` 增加各類管理操作失敗時「中文情境＋原始診斷」的畫面測試，先確認測試失敗。

### Implementation for User Story 2

- [X] T021 [US2] 在 `frontend/src/utils/presentation-labels.ts` 建立有型別的跨頁狀態／歸因顯示對照與未知值回退，對應 `specs/010-unify-zh-tw-ui/contracts/admin-ui-copy.md` 且不改變原始列舉值。
- [X] T022 [P] [US2] 更新 `frontend/src/views/judge/components/OriginChip.vue`、`DeployTestRunStatus.vue`、`DeployTestProbeResults.vue`、`RehearsalStageList.vue` 的狀態、設定來源、評測代碼與歸因顯示；`clamped` 明示原設定值未採用，診斷原文保留。
- [X] T023 [P] [US2] 更新 `frontend/src/views/device/components/DeviceGrid.vue`、`frontend/src/views/connection/ConnectionView.vue`、`frontend/src/views/anticheat/components/AnticheatFilterBar.vue`、`AnticheatTable.vue` 的設備、連線及警告處理狀態顯示，不改篩選值。
- [X] T024 [P] [US2] 更新 `frontend/src/views/score/components/ScoreTable.vue`、`SubmissionModal.vue`、`frontend/src/components/SubmissionDetails.vue` 的評測結果與空白／載入顯示，保留 AC、WA、TLE、MLE、CE、SE 等原碼。
- [X] T025 [P] [US2] 更新 `frontend/src/views/config/ConfigView.vue`、`frontend/src/views/student/StudentView.vue`、`frontend/src/views/log/LogView.vue` 的載入、空白及操作失敗畫面，為原始後端錯誤補中文操作情境。
- [X] T026 [P] [US2] 更新 `frontend/src/views/judge/components/JudgeSettingsPanel.vue`、`DeployTestPanel.vue`、`RehearsalPanel.vue` 與 `frontend/src/views/manage/components/StudentReadiness.vue` 的錯誤呈現，保留原始診斷與系統失敗歸因。
- [X] T027 [US2] 檢查 `frontend/src/stores/config.store.ts`、`score.store.ts`、`student.store.ts`、`connection.store.ts`、`log.store.ts`、`anticheat.store.ts`、`judge-settings.store.ts`、`deploy-test.store.ts`、`rehearsal.store.ts` 的前端自產英文回退訊息；將其改為中文或由畫面補中文情境，但保持後端原文可取得。
- [X] T028 [US2] 更新 `frontend/test/deploy-test-view.test.ts`、`frontend/test/rehearsal-panel.test.ts`、`frontend/test/judge-settings-view.test.ts` 中依賴英文狀態文案的斷言；保留原始代碼、歸因與診斷斷言，執行 `frontend/test/ui-copy-status.test.ts` 與 `frontend/test/ui-copy-errors.test.ts`。

**Checkpoint**: US2 可單獨驗證狀態與異常理解，且不把系統故障歸咎學生。

---

## Phase 5: User Story 3 - 安全完成高風險操作 (Priority: P3)

**Goal**: 高風險警告為繁體中文且後果完整；原有輸入門檻、確認與取消行為不變。

**Independent Test**: 對線上／離線設備與重設流程測試警告、空白／錯誤／正確確認字串及取消，確認實際操作事件沒有退化。

### Tests for User Story 3

- [X] T029 [US3] 在 `frontend/test/device-confirmation-copy.test.ts` 加入線上與離線解除綁定／註銷的中文警告和 `CONFIRM` 精確門檻測試，含取消不觸發操作；先確認文案測試失敗。
- [X] T030 [P] [US3] 在 `frontend/test/exam-state-controls.test.ts` 與 `frontend/test/rehearsal-panel.test.ts` 補上重設／演練清除後果及取消行為斷言，先確認新增文案斷言失敗。

### Implementation for User Story 3

- [X] T031 [US3] 翻譯 `frontend/src/views/device/components/UnbindWarningDialog.vue` 的操作名稱、線上／離線警告、輸入說明與取消／確認鈕；保留 `requiredText === 'CONFIRM'` 的現有判斷及事件。
- [X] T032 [P] [US3] 核對並補齊 `frontend/src/views/manage/components/ExamStateControls.vue`、`frontend/src/views/config/components/DbInitPanel.vue` 的初始化／重設中文後果說明，保留既有確認與取消流程。
- [X] T033 [P] [US3] 核對並補齊 `frontend/src/views/judge/components/RehearsalPanel.vue` 的演練清除警告與取消說明，保留原始清除與封鎖條件。
- [X] T034 [US3] 執行 `frontend/test/device-confirmation-copy.test.ts`、`frontend/test/exam-state-controls.test.ts`、`frontend/test/rehearsal-panel.test.ts`，並依 `specs/010-unify-zh-tw-ui/contracts/admin-ui-copy.md` 核對每個高風險操作的警告、門檻與取消結果。

**Checkpoint**: US3 可單獨驗證安全操作流程。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 全面核對文字、行為與交付門檻。

- [X] T035 檢查 `frontend/src/`、`frontend/index.html` 與 `specs/010-unify-zh-tw-ui/copy-inventory.md` 的所有可見文字，補齊遺漏英文、統一譯名，逐筆說明必要英文例外及未翻譯原始資料。
- [X] T036 依 `specs/010-unify-zh-tw-ui/quickstart.md` 執行 `frontend/package.json` 的 `typecheck`、`test`、`build` 指令，將結果與既有失敗明確記在 `specs/010-unify-zh-tw-ui/validation.md`。
- [ ] T037 依 `specs/010-unify-zh-tw-ui/quickstart.md` 逐頁走查九個區域的正常、載入、空白、錯誤與窄螢幕狀態，在 `specs/010-unify-zh-tw-ui/validation.md` 記錄 SC-001 至 SC-004 的結果。
- [ ] T038 依 `specs/010-unify-zh-tw-ui/spec.md` 的 SC-005 取得管理員與助教各一次跨頁走查結果，將理解警告與狀態的結果及合併前覆蓋率限制記在 `specs/010-unify-zh-tw-ui/validation.md`。

---

## Dependencies & Execution Order

### Phase Dependencies

1. Setup T001–T002 → Foundational T003–T004。
2. Foundational 完成後，US1、US2、US3 的測試及不重疊檔案可開始；實際交付順序以 P1 → P2 → P3 為主。
3. 同一檔案若跨故事修改，先完成較早故事的任務，再處理後續故事，例如 `DeviceGrid.vue`、`JudgeSettingsPanel.vue`、`RehearsalPanel.vue`。
4. Polish T035–T038 需在三個故事完成後進行；T036 與 T037 都更新 `validation.md`，依序執行。

### User Story Dependencies

- **US1 (P1)**: 只依賴共同用語表；可作為 MVP 獨立交付。
- **US2 (P2)**: 只依賴共同用語表；若與 US1 共用檔案，需等該檔 US1 文字改動完成後接續修改。
- **US3 (P3)**: 只依賴共同用語表；`RehearsalPanel.vue` 與 US1／US2 共用，依檔案順序處理。

### Within Each User Story

- 新增或調整測試 → 確認測試因預期文案／行為而失敗 → 修改顯示文案或對照 → 重跑故事測試。
- 固定顯示文字與資料值分離；未知值及外部診斷依契約回退。
- 完成各故事的獨立測試，再進入整體驗收。

### Parallel Opportunities

- US1：T008–T016 分別處理不同檔案群，可平行；T005 與 T006 也可平行。
- US2：T019 與 T020 測試檔不同，可平行；T022–T026 不重疊檔案群時可平行。
- US3：T029 與 T030 測試檔不同，可平行；T032 與 T033 可平行。
- 共用檔案須依上述依賴序列處理；`[P]` 不表示可與同檔的其他故事任務同時編輯。

## Parallel Example: User Story 1

1. 完成 T005、T006 並確認新測試失敗。
2. 同時處理 T008（考試設定主要表單）、T010（評測設定）、T012（成績）、T014（防作弊與紀錄）；各任務編輯不同檔案。
3. 合併後執行 T017、T018，核對跨頁譯名。

## Parallel Example: User Story 2

1. 分別撰寫 T019 狀態測試與 T020 錯誤畫面測試。
2. T021 完成共用顯示對照後，同時處理 T022（評測）、T023（設備與警告）、T024（成績）及 T025（設定與學生）。
3. 完成 T027 的錯誤回退檢查，再執行 T028。

## Parallel Example: User Story 3

1. 分別撰寫 T029 設備確認測試與 T030 重設／演練測試。
2. 同時處理 T032 考試重設與 T033 演練清除；T031 獨立處理設備解除綁定對話框。
3. 執行 T034 核對全部警告與取消結果。

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Setup 與 Foundational，建立清冊與用語表。
2. 完成 US1 的測試、九區域一般文案及瀏覽器語言／標題。
3. 以 T018 驗證主要導覽與操作可獨立使用，再接續狀態與高風險流程。

### Incremental Delivery

1. US1 提供一致的繁體中文主要流程。
2. US2 補齊載入、空白、失敗、診斷與歸因。
3. US3 完成高風險警告與確認流程驗證。
4. Final Phase 完成九區域走查、建置、測試及憲法合併門檻檢查。

## Notes

- 只處理管理端介面文案；不要更改後端／桌面端資料契約與使用者內容。
- 保留 feature 009 的未提交工作；本功能實作需在專用分支或隔離工作樹。
- 現有前端覆蓋率設定只計算部分檔案；完整覆蓋率要求須在合併前依憲法另行核對，不可由單一測試指令通過推定。
