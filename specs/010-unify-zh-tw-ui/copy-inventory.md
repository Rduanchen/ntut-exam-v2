# 管理介面文案清冊

建立日期：2026-10-20。範圍為 `frontend/src/App.vue`、`frontend/src/views/`、`frontend/src/components/SubmissionDetails.vue`、會向畫面提供錯誤的 `frontend/src/stores/` 與 `frontend/index.html`。依源碼掃描，至少 301 行含可能可見的英文字；包含動態資料與程式碼的誤報，實作時按下表分類。

| 區域／來源 | 情境與現況例 | 建議繁體中文顯示 |
| --- | --- | --- |
| 全域 `App.vue`、`index.html` | Manage、Config、Judge、Score、Student、Anti-Cheat、Logs、Connection、Device；Admin Control Panel；frontend | 考試管理、考試設定、評測、成績、學生、防作弊、紀錄、連線管理、設備監控；管理控制台；北科大考試管理系統 |
| 考試管理 `views/manage/` | Exam Control & Management、Message Content | 考試管理、訊息內容；考試階段與就緒狀態沿用既有中文 |
| 考試設定 `views/config/` | Exam Configuration Dashboard、General Settings、Sections & Puzzles、Import CSV、Time Limit (ms) | 考試設定、一般設定、區段與題目、匯入 CSV、時間限制（ms） |
| 評測 `views/judge/` | Judge、Settings、Deploy Test、Judging rules、Machine capacity、Run | 評測、設定、部署測試、評測規則、機器容量、執行紀錄 |
| 成績 `views/score/`、`components/SubmissionDetails.vue` | Score Board、Submission Details、Expected Output、Visible / Hidden | 成績看板、提交詳情、預期輸出、公開／隱藏測資 |
| 學生 `views/student/` | Student Management、Unknown | 學生管理、未知學生 |
| 防作弊 `views/anticheat/` | Anti-Cheat、Student ID、Unresolved / Resolved | 防作弊、學號、未處理／已處理 |
| 紀錄 `views/log/` | System Logs、Student ID | 系統操作紀錄、學號；日誌原文不翻譯 |
| 連線管理 `views/connection/` | Connection Management、Allow New Device Registration、Not Bound | 連線管理、允許新設備註冊、未綁定 |
| 設備監控 `views/device/` | Device Monitor、No Devices Found、ONLINE、CONFIRM | 設備監控、找不到設備、線上；固定確認字串 CONFIRM 保留 |
| 錯誤來源 `stores/` 與頁面提示 | Failed to fetch…、Unknown error、後端 `error/message/reason` | 前端自行產生「無法載入…／未知錯誤」；後端原文旁加中文操作情境 |

## 保留英文與原始值

| 類別 | 保留內容 | 原因與顯示方式 |
| --- | --- | --- |
| 精確確認 | `CONFIRM` | 線上設備解除綁定必須精確輸入；周邊說明翻中文 |
| 網路與識別 | IP、UUID、學號實值、路由路徑 | 需要精確辨認；欄位名稱加中文 |
| 資料格式與檔名 | JSON、CSV、`config.json`、`docker-compose.yml` | 與匯入匯出或部署檔案名稱對應 |
| 評測系統 | Piston、C、C++、Python、AC、WA、TLE、MLE、CE、SE、ms、MB | 專業名稱與代碼保留，旁附中文含義；不改變歸因 |
| 執行資料 | API／Socket 列舉值與鍵、路由、`data-test`、考卷與學生資料、程式碼、日誌、外部診斷 | 用於契約、測試或追查；只能翻顯示標籤 |

## 不能改變的判斷與例外

- `frontend/src/views/device/components/UnbindWarningDialog.vue` 的 `requiredText === 'CONFIRM'` 判斷。
- `frontend/src/views/judge/components/OriginChip.vue` 的 `clamped` 意思是原設定被拒絕、未採用。
- `frontend/src/views/judge/components/DeployTestProbeResults.vue` 的結果代碼與 `submission/system` 歸因，及 `RehearsalStageList.vue` 的系統失敗說明。
- `frontend/src/router/index.ts` 的路徑及 `frontend/src/types/`、`frontend/src/stores/` 的資料列舉值不翻譯。

完成時逐頁檢查標題、分頁、按鈕、表格、輸入提示、空白／載入／錯誤及確認對話框，並以 `contracts/admin-ui-copy.md` 核對一致性。

## 實作盤點進度

- US1：九個導覽區域的一般固定文案、表單、表格、操作與瀏覽器標題已套用共用譯名；導覽與設定表單元件測試通過。
- US2：評測／設備／連線狀態、設定來源、未知值與原始診斷的中文情境已實作並通過測試（`ui-copy-status.test.ts`、`ui-copy-errors.test.ts`、`deploy-test-view.test.ts`、各 stores 錯誤回退中文化）。
- US3：設備解除綁定與註銷對話框已完成繁體中文翻譯，保留 `CONFIRM` 精確門檻；高風險考試重設、演練清除警告與取消行為已通過測試（`device-confirmation-copy.test.ts`、`exam-state-controls.test.ts`、`rehearsal-panel.test.ts`）。
