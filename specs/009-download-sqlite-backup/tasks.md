# Tasks: 下載 SQLite 資料庫備份

**Input**: `specs/009-download-sqlite-backup/` 中的 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/admin-backup-api.md`、`quickstart.md`

**Tests**: 專案憲法要求測試與嚴格型別檢查；各情境先寫可失敗的驗收測試，再實作。

**Organization**: 依 US1、US2、US3 分階段，任務編號代表執行順序；`[P]` 僅標示可在不同檔案並行且不依賴未完成任務的項目。

## Phase 1: Setup（共用準備）

**Purpose**: 建立隔離的測試資料庫與備份介面型別；不變更現有測試使用的記憶體資料庫。

- [X] T001 [P] 在 `backend/test/fixtures/backup-database.fixture.ts` 建立可建立、寫入及清除暫存檔案型 SQLite 資料庫的測試 fixture，支援切換 WAL 並提供已提交資料的查詢方法。
- [X] T002 [P] 在 `backend/src/types/sqlite-backup.type.ts` 為現有 `sqlite3` 執行時的 `Database#backup`、`Backup#step`、完成狀態與錯誤回呼建立窄型別，禁止使用 `any`。

---

## Phase 2: Foundational（所有情境的前置條件）

**Purpose**: 讓備份服務取得與正式 Sequelize 相同的資料庫來源。

- [X] T003 在 `backend/src/config/database.config.ts` 匯出已解析的資料庫儲存位置，保持 `DB_STORAGE` 與現有預設路徑一致；不可在備份服務重算路徑或開啟不存在的空白來源庫。

**Checkpoint**: 檔案型 fixture、備份 API 型別與唯一資料庫來源可供各情境使用。

---

## Phase 3: User Story 1 - 管理員下載目前資料庫的備份（P1）🎯

**Goal**: 一次管理端請求取得可獨立開啟、含已提交資料且不修改來源的 SQLite 檔案。

**Independent Test**: 使用有資料的檔案型資料庫呼叫 API，確認 200、附件標頭、SQLite 完整性與原資料可查；備份期間仍可完成寫入。

### Tests for User Story 1

- [X] T004 [P] [US1] 在 `backend/test/unit/services/database-backup.service.test.ts` 先寫真實檔案型 SQLite 測試：已提交資料、WAL 未 checkpoint 資料、`PRAGMA integrity_check`、備份時寫入、來源不變與兩個同時備份；確認未實作前失敗。
- [X] T005 [P] [US1] 在 `backend/test/integration/routes/admin-backup.test.ts` 先寫 `GET /admin/backup` 成功契約測試：200、原始 SQLite 位元組、附件檔名、內容型別與已提交資料；以測試專用備份服務注入或隔離檔案型來源，確認未實作前失敗。

### Implementation for User Story 1

- [X] T006 [US1] 在 `backend/src/services/database-backup.service.ts` 以唯讀來源連線與每次請求專用的私有暫存目錄，分批執行 SQLite Online Backup API；確認完成後檢查檔案大小與 `PRAGMA quick_check`，回傳檔案資訊與可呼叫的清理程序；依賴 T002、T003、T004。
- [X] T007 [US1] 在 `backend/src/controllers/admin/admin-backup.controller.ts` 建立下載處理器：先等待 T006 的有效備份，再設定 `application/vnd.sqlite3`、安全的 UTC 附件檔名及檔案長度，使用串流傳送並在結束時清理；依賴 T006。
- [X] T008 [US1] 在 `backend/src/routes/admin/admin-backup.route.ts` 定義 `GET /`，並在 `backend/src/routes/admin/index.ts` 的既有 `verifyAdminToken` 之後掛載為 `/backup`；依賴 T007。
- [X] T009 [US1] 執行 `backend/test/unit/services/database-backup.service.test.ts` 與 `backend/test/integration/routes/admin-backup.test.ts` 的 US1 測試，修正實作直到快照可開啟、資料一致、WAL 內容存在且考試寫入不中斷；必要修正限於 `backend/src/services/database-backup.service.ts`、`backend/src/controllers/admin/admin-backup.controller.ts`。

**Checkpoint**: US1 可獨立展示有效下載；進入正式環境前仍需完成 US2 的保密驗證及 US3 的失敗處理。

---

## Phase 4: User Story 2 - 保護備份中的考試資料（P1）

**Goal**: 只有既有管理端有效憑證能取得備份，回應與錯誤不洩漏敏感內容。

**Independent Test**: 無憑證、錯誤 Bearer token、錯誤 `x-admin-token` 均為 401 且無資料庫位元組；有效憑證取得 200；成功與失敗回應不含伺服器路徑或憑證。

### Tests for User Story 2

- [X] T010 [US2] 在 `backend/test/integration/routes/admin-backup.test.ts` 先補上缺少／無效憑證、兩種有效憑證格式、無匿名旁路、`Cache-Control: no-store` 與無敏感路徑或 token 的測試；確認缺少的保護先失敗。

### Implementation for User Story 2

- [X] T011 [US2] 在 `backend/src/controllers/admin/admin-backup.controller.ts` 加入非快取回應與安全的錯誤／日誌訊息，不把憑證、來源路徑、暫存路徑或 SQL 內容傳給呼叫者；依賴 T010。
- [X] T012 [US2] 檢查 `backend/src/routes/admin/index.ts` 中備份路由確實僅經由 `verifyAdminToken` 暴露，修正任何繞過路徑並執行 `backend/test/integration/routes/admin-backup.test.ts` 的 US2 安全測試；依賴 T011。

**Checkpoint**: US2 可獨立證明授權邊界；此時 API 不存在匿名下載入口。

---

## Phase 5: User Story 3 - 備份失敗時收到明確結果（P2）

**Goal**: 來源不可用、備份失敗、資源忙碌或傳輸中斷時，回應明確且不留下可被誤認為成功的檔案；故障排除後可重試。

**Independent Test**: 模擬不存在的來源、複製失敗及下載中斷，確認 503／500 合約、無成功附件標頭、暫存清理與後續成功重試。

### Tests for User Story 3

- [X] T013 [P] [US3] 在 `backend/test/unit/services/database-backup.service.test.ts` 先補來源不存在、`BUSY`／`LOCKED` 有界重試、複製中失敗、同時請求結果隔離、等待逾時與暫存目錄清理測試。
- [X] T014 [P] [US3] 在 `backend/test/integration/routes/admin-backup.test.ts` 先補 503／500 安全 JSON、未送出成功標頭、串流失敗或用戶端斷線時的清理，以及故障後重試測試。

### Implementation for User Story 3

- [X] T015 [US3] 在 `backend/src/services/database-backup.service.ts` 加入有限並行、等待及複製期限、`BUSY`／`LOCKED` 回退重試、取消訊號、所有失敗路徑的唯讀連線關閉與部分目的檔刪除；依賴 T013。
- [X] T016 [US3] 在 `backend/src/controllers/admin/admin-backup.controller.ts` 將來源不可用／資源忙碌映射至 503、其他產生或驗證失敗映射至 500，且只在備份驗證後送出附件標頭；已開始串流後失敗須終止連線並清理；依賴 T014、T015。
- [X] T017 [US3] 在 `backend/test/integration/routes/admin-backup.test.ts` 與 `backend/test/unit/services/database-backup.service.test.ts` 執行 US3 測試並修正失敗後重試、並行下載、斷線清理及正式資料不變的行為；必要修正限於 `backend/src/services/database-backup.service.ts`、`backend/src/controllers/admin/admin-backup.controller.ts`。

**Checkpoint**: 三個使用情境均可獨立驗收；任何失敗都不產生被宣稱有效的備份。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 完成憲法要求的型別、覆蓋率、安全及實機驗收。

- [X] T018 [P] 將 `backend/src/services/database-backup.service.ts`、`backend/src/controllers/admin/admin-backup.controller.ts` 與 `backend/src/routes/admin/admin-backup.route.ts` 加入 `backend/vitest.config.ts` 的覆蓋率範圍，確認新增程式碼及分支符合專案測試門檻。
- [X] T019 [P] 在 `specs/009-download-sqlite-backup/quickstart.md` 補上實作後確認的實際測試命令與端點範例，核對 `specs/009-download-sqlite-backup/contracts/admin-backup-api.md` 的狀態碼和標頭。
- [X] T020 執行 `pnpm --filter backend test`、`pnpm --filter backend build` 與 `pnpm --filter backend lint`，依結果修正 `backend/src/services/database-backup.service.ts`、`backend/src/controllers/admin/admin-backup.controller.ts`、`backend/test/unit/services/database-backup.service.test.ts`、`backend/test/integration/routes/admin-backup.test.ts` 的型別、測試及 lint 問題。
- [ ] T021 在測試用考場機器依 `specs/009-download-sqlite-backup/quickstart.md` 驗證管理員下載、未授權 401、學生提交與助教評分期間備份，以及 100 MB 以下資料庫 p95 在 30 秒內開始下載；將實測結果與限制記錄回同一檔案。

---

## Dependencies & Execution Order

```text
T001 ─┐
      ├── T004/T005 ── T006 ── T007 ── T008 ── T009 (US1)
T002 ─┼── T006
T003 ─┘
US1 ── T010 ── T011 ── T012 (US2)
US1 ── T013/T014 ── T015 ── T016 ── T017 (US3)
US2 + US3 ── T018/T019 ── T020 ── T021
```

- **Setup**: T001 與 T002 可平行；T003 在共用準備後完成，阻擋情境實作。
- **US1**: 依賴 T001–T003，提供可下載的一致備份。
- **US2**: 驗證並補強 US1 端點的既有管理權限；可與 US3 的不同檔案測試工作並行，但修改相同控制器時需循序整合。
- **US3**: 延伸 US1 備份服務與端點的失敗路徑；測試可與 US2 的權限檢查分開執行。
- **Polish**: 依賴三個情境完成；T018 與 T019 可平行，T020 與 T021 依序執行。

## Parallel Examples

- **US1**: T004 的服務測試與 T005 的路由契約測試位於不同檔案，可同時撰寫；T006 完成後再接 T007 與 T008。
- **US2**: T010、T011、T012 依序執行，因為測試、控制器保護與路由稽核共用同一端點。
- **US3**: T013 的服務故障測試與 T014 的端點故障測試位於不同檔案，可同時撰寫；T015 完成後再做 T016。

## Implementation Strategy

1. 完成 Setup 與 Foundational，再先寫 US1 測試、實作可下載的一致性備份。
2. US1 是功能展示的最小範圍；正式交付須完成 US2 的存取保護驗證與 US3 的失敗處理。
3. 逐一驗收 US2、US3，最後執行完整型別、測試、覆蓋率與考場環境走查。

## Notes

- 不新增資料表、排程備份、歷史備份清單、還原 API 或管理頁面按鈕。
- 所有測試資料庫與備份檔均須使用隔離暫存位置；不得覆寫 `backend/database.sqlite`。

## Implementation Validation Status

- T020: 完整測試與建置通過；全專案 lint 仍因未修改的既有檔案有 33 個錯誤而失敗，這次新增／修改的備份檔案單獨執行 ESLint 為零錯誤。
- T021: 已完成開發機隔離 HTTP 測試，結果記於 quickstart；正式考場硬體與真實學生／助教 API 負載仍待現場環境驗收，故保留未完成。
