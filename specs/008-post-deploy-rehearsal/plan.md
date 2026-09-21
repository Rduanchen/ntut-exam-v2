# Implementation Plan: Post-Deployment Rehearsal (部署後測試)

**Branch**: `feat/008-post-deploy-rehearsal` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-post-deploy-rehearsal/spec.md`

## Summary

在管理端新增「部署後測試」：助教按下並確認之後，後端在背景**對自己發出真實的 HTTP 請求**，依序走完一場最小的考試 —— 上傳演練考卷 → 初始化 → 推進階段 → 模擬學生註冊／取卷／登入／取金鑰／提交 → 助教手動評測 → 全域 reset 清除。逐段結果即時回報，報告存於 `SystemSettings`（reset 不動它），因此清除之後仍可查閱。

**核心技術決策**：演練不呼叫 service，而是走 loopback HTTP。理由是本功能要驗證的東西**只存在於 HTTP 層**——`examPhaseMiddleware` 的階段矩陣、`decryptAndVerifyDeviceSession` 的 AES-GCM 與 replay 防護、`verifyAdminToken`、以及 202-accept 的評測交接。繞過它們的演練證明的是「資料庫可寫」，不是「考試可辦」。

**實作結構沿用 feature 006 的三件組**（service / repository / startup service），因為它已經解決了同一批問題：背景執行、逐段持久化、deadline、重啟後的中斷標記。

## Technical Context

**Language/Version**: TypeScript (strict)，Node.js；後端 Express + Sequelize，前端 Vue 3 + Vite

**Primary Dependencies**: 既有依賴即可 —— zod（schema）、node:crypto（模擬學生的 RSA/AES-GCM 握手）、`piston-judger`（經既有 `JudgeExecutionService`）。**不新增任何套件**；HTTP 以 Node 內建 `fetch` 發出。

**Storage**: SQLite via Sequelize。演練報告寫入 `SystemSettings`（key `post_deploy_rehearsal_latest`），與 `DeployTestRepository` 同機制。

**Testing**: 後端 `tsc -p tsconfig.test.json && vitest run`（unit + integration，integration 以 supertest 對真實 app 發請求）；前端 Vitest。

**Target Platform**: 部署於考場現場主機的 Linux/macOS 容器化服務

**Project Type**: Web application（`backend/` + `frontend/`）

**Performance Goals**: 整場演練 ≤ 5 分鐘（SC-001）。演練的評測負載極小（2 份提交），但仍受既有全域併發上限約束。

**Constraints**:
- 僅可在 `UNINITIALIZED` 且無考卷、無學生時啟動（FR-002）。
- 演練期間不得與 feature 006 的部署測試或真實學生評測並行。
- 清除 = 既有全域 reset，**不另造第二套清除工序**。
- 不得新增任何可繞過階段矩陣、身分驗證或可被外部觸發的清除捷徑。

**Scale/Scope**: 1 名模擬學生、1 台模擬裝置、2 道題、2 份提交、6 個演練段落。後端新增約 6 個檔案，前端 2 個。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Type Safety**: 演練考卷以 `ExamConfig`（`config.schema.ts` 的 production 型別）標註並於模組載入時 `examConfigSchema.parse` 驗證 —— 直接對應 experience.md 教訓 #4「fixture 必須型別綁定到 production schema 且只有單一來源」。演練 run／段落／報告全部由 zod schema 定義並於讀寫兩端 parse。無 `any`。
- [x] **Async & Concurrency**: 演練在背景非同步執行，啟動端點立即回 202。`JudgingWorkCoordinator` 擴充一個 rehearsal lease，與部署測試互斥。評測負載走既有的全域 `pLimit`，不自建第二個限制器（教訓 #6.2：limiter 貼著資源，不貼著呼叫者）。
- [x] **Security & Stability**: 啟動端點掛在 `verifyAdminToken` 之下；演練**不新增任何憑證或旁路**——它用的是 process 既有的 `ADMIN_TOKEN` 對自己發請求，與外部助教走同一條路。前置條件（`UNINITIALIZED` + 無考卷 + 無學生）是 US5 的防線；確認旗標 `acknowledgeWipe` 讓破壞性後果必須被明示。模擬學生的名單項**不帶 IP**，因此 `AuthService` 的 IP 比對自然跳過，無需為演練開任何後門。
- [x] **Low Coupling**: 新增 `rehearsal.service` / `rehearsal-repository` / `rehearsal-startup.service` 三件組，與 deploy-test 三件組並列且互不依賴。對既有程式碼的唯一侵入是 `JudgingWorkCoordinator` 多一個 lease 種類（見 research.md D4，這是被既有設計逼出來的，不是選擇）。
- [x] **Testability**: 沿用 `DeployTestService.configureForTests` 的依賴注入形態：`now`、`http`（發請求的函式）、`examState` 皆可替換，因此段落邏輯可純單元測試；另有一條 integration test 以 supertest 跑完真實 app 的全程。

## Project Structure

### Documentation (this feature)

```text
specs/008-post-deploy-rehearsal/
├── plan.md              # 本檔
├── research.md          # Phase 0：七項技術決策與一項設計衝突
├── data-model.md        # Phase 1：實體、schema、狀態轉移
├── quickstart.md        # Phase 1：驗證指南
├── contracts/
│   ├── rehearsal-admin-api.md   # 管理端對外契約
│   └── rehearsal-flow.md        # 演練內部對自己發出的請求序列
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks 產生，本指令不建立
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/
│   │   └── rehearsal-paper.config.ts        # 新增：型別綁定的演練考卷（單一來源）
│   ├── schemas/
│   │   └── rehearsal.schema.ts              # 新增：run／stage／報告的 zod schema
│   ├── types/
│   │   └── rehearsal.type.ts                # 新增：由 schema 推導的型別
│   ├── services/
│   │   ├── rehearsal.service.ts             # 新增：段落編排、deadline、清除
│   │   ├── rehearsal-client.ts              # 新增：模擬學生的握手與加密請求
│   │   ├── rehearsal-repository.ts          # 新增：報告持久化（SystemSettings）
│   │   ├── rehearsal-startup.service.ts     # 新增：重啟後標記中斷並完成清除
│   │   └── judging-work-coordinator.ts      # 修改：新增 rehearsal lease
│   ├── controllers/admin/
│   │   └── admin-rehearsal.controller.ts    # 新增
│   ├── routes/admin/
│   │   └── admin-rehearsal.route.ts         # 新增，掛在 /admin/rehearsal
│   └── index.ts                             # 修改：啟動時呼叫 RehearsalStartupService
└── test/
    ├── unit/services/rehearsal.service.test.ts
    ├── unit/services/rehearsal-client.test.ts
    ├── unit/services/judging-work-coordinator.test.ts   # 修改：涵蓋 rehearsal lease
    └── integration/controllers/admin/rehearsal.controller.test.ts

frontend/
├── src/
│   ├── api/
│   │   └── rehearsal.ts                     # 新增
│   └── views/judge/components/
│       ├── RehearsalPanel.vue               # 新增：啟動、確認、進度
│       └── RehearsalStageList.vue           # 新增：逐段結果
└── test/                                     # RehearsalPanel 的 Vitest
```

**Structure Decision**: 既有的 `backend/` + `frontend/` 雙專案結構，不新增第三個專案。管理端 UI 落在 `frontend/src/views/judge/`（`JudgeSettingsView.vue`），與 feature 006 的 `DeployTestPanel.vue` 並列 —— 該頁已經是「部署後驗證」的既有家，另開頂層區域會讓助教在考前必須記得去兩個地方。**這一點值得在 review 時複議**：本功能驗證的是整個系統而非 judger，頁面名稱與內容的落差會隨時間擴大。

## Complexity Tracking

> Constitution Check 全數通過，無須豁免。下表記錄一項**被迫的既有程式碼修改**，以免在 review 時被誤認為範圍蔓延。

| 修改 | 為何必要 | 被否決的簡單替代 |
|---|---|---|
| `JudgingWorkCoordinator` 新增 rehearsal lease | 演練必須同時（a）排除 feature 006 的部署測試與真實學生評測，以及（b）允許**它自己觸發的**助教評測。現有的兩種 lease 做不到：拿 deploy lease 會讓 `JudgeQueueService.start` 的 `acquireStudent()` 回 `null` 而丟 `JudgingWorkConflictError`，演練走到評測段必然自己卡死自己。 | 「演練不拿任何 lease」——則部署測試可在演練中途插入並共用評測引擎，兩者互相污染；「演練評測繞過 `JudgeQueueService`」——則演練驗證的不是助教真正走的那條路，US3 失去意義。 |

## Constitution Re-Check (post-Phase 1)

Phase 1 設計完成後重新評估，五項仍然通過。設計過程中改變的判斷記於下：

- **Type Safety** ✅ 無變化。新增的具體防線：`rehearsal-paper.config.ts` 以 production 的 `ExamConfig` 標註，考卷 schema 演進時會**編譯失敗**而非靜默脫鉤；quickstart §A 明文禁止以 `as` / `any` 關掉它。
- **Async & Concurrency** ✅ 設計過程中發現既有互斥模型缺少「演練」這個角色（research.md D4）。解法是在 `JudgingWorkCoordinator` 加第三種 lease，而非在演練側自建第二套限制 —— 仍然遵守「limiter 貼著資源」。
- **Security & Stability** ✅ 設計後更強：D3 確認模擬學生能通過防作弊**不需要任何 production 旁路**（名單不帶 IP，既有短路自然生效）。`rehearsal-flow.md` 的不變式 #1 把「沒有 `isRehearsal` 旗標、沒有專屬端點、沒有被略過的檢查」寫成契約。
- **Low Coupling** ✅ 唯一的既有程式碼侵入仍是 `JudgingWorkCoordinator`（已於 Complexity Tracking 記錄）。D5 確認報告持久化**不需要修改全域 reset** —— 設計初期曾擔心要動 `wipeAllData`，查證後不必。
- **Testability** ✅ 三層可測：段落邏輯（注入 `http` 替身，不需 server）、契約（supertest 對真實 app）、真實部署（quickstart §C）。

**新增的風險紀錄**：`RehearsalStartupService` 會在開機時執行破壞性清除。其安全性完全依賴一條順序要求 —— `RehearsalRun`（`ownsSystemState: true`）必須在第一次變更系統**之前**落地（research.md D6、rehearsal-flow.md 段落 1）。實作與 review 時這是最該被盯的一行。
