# Implementation Plan: Exam Lifecycle State Machine and Paper Encryption

**Branch**: `feat/007-environment-precheck-plan` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-exam-lifecycle-state-machine/spec.md`

**Companion repo**: `ntut-exam-v2/desktop` on `feat/003-exam-lifecycle-state-machine`


> **2026-10-14 規劃範圍**：本次增量涵蓋 FR-044–FR-049、SC-015–SC-017。既有生命週期與考卷加密已實作；下方原始計畫保留作為基線，不代表全部需要重做。本次以「考前語言 API 與環境檢查增量」及 `contracts/environment-precheck-api.md` 為準；舊文件中把環境檢查當登入前置條件的描述由本次決策取代。`tasks.md` 已追加 T148–T181，本次實作與驗證記於 validation.md。

## Summary

把後端的全域考試階段從四個（其中 `NOT_STARTED` 身兼「已初始化」與「準備登入」兩職）重整為五個語意互斥的階段，轉移單向、僅 reset 可退，並把「哪個階段允許哪些操作」從散落四處的隱含規則收斂為一張後端強制的矩陣。

學生端不再維護平行的狀態機：畫面與能力改由「全域階段 + 本機裝置狀態」推導，因此單一學生的異常不需要階段退回 —— 清掉裝置身分層後重走同一條入場流程即可（重來）。這順帶修好目前 100% 重現的死路：機器重啟必被判為二次綁定而無法回到考試。

考卷改為兩層加密。裝置 AES 金鑰（學生本就持有）只負責傳輸；考卷內容由一把後端扣留至開考的 `K_exam` 保護。考卷切分為明文 `meta`（僅環境檢查與入場所需）與密文 `cipher`（題目與全部測資），兩者在 `INITIALIZED` 即下發，金鑰在 `IN_PROGRESS` 才釋出。金鑰有兩條導出同一把值的取得路徑 —— 線上經加密端點、離線經監考口令 —— 使開考不依賴後端可用。

## Technical Context

**Language/Version**: TypeScript 5.x（後端 Node ≥ 20.19；桌面版 Electron 31 / Node 20）

**Primary Dependencies**:
- 後端 — Express 4、Sequelize 6 + sequelize-typescript、socket.io 4、zod **^3.23**、Node `crypto`（內建）
- 管理端 — Vue 3、Pinia、Vuetify 3、axios（設定編輯器持有 config schema 的第三份定義，為 TypeScript type）
- 桌面版 — Electron 31、electron-vite、Vue 3、socket.io-client 4、zod **^4.3**、Node `crypto`（內建）

**Storage**: SQLite（Sequelize）。本功能新增 `SystemSettings` 三個鍵（`exam_key`、`exam_config_cipher`、`exam_config_meta`）與 `DeviceKeyMap` 四個欄位；`LoginRequest` 變更 `type` 值域並新增 `previousTestId`。桌面版一律 RAM-only，永不落盤。

**Testing**: 兩端皆為 Vitest。後端 `pnpm test`（含 `tsc -p tsconfig.test.json` 型別檢查）；桌面版 `npm test`。新增跨 repo 契約 fixture，兩端各有測試以同一份檔案驗證自身 schema。

**Target Platform**: 後端為區域網路內的單一 Linux/Docker 節點；桌面版為 Windows / macOS 考場機器，**一次性使用**（一場考試佈署一次，考後不沿用）。

**Project Type**: 跨 repo 的 web service + desktop app。兩端必須原子佈署。

**Performance Goals**: 開考瞬間全場機器同時索取 `K_exam` —— 該回應必須小於考卷本身的 1%（SC-004）。考卷本體的下發已提前至 `INITIALIZED`，此時無同時性壓力。

**Constraints**:
- 金鑰不落地（既有的刻意設計）—— 桌面版重啟必然失去身分，重來路徑承接此後果。
- 開考與結束不得有後端單點依賴（開考已解決；結束依決策退化為人工程序）。
- 不做向後相容 —— 機器一次性，但代價是跨 repo 變更必須同時佈署。
- 監考口令刻意簡短（已接受的風險 R1）。

**Scale/Scope**: 單場考試約 40–60 台機器；後端 3 個新端點、1 個新 middleware、1 個新服務；桌面版 schema 拆分與合併、金鑰兩條路徑、reset 完整清除、待送佇列改寫。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### 初次評估（Phase 0 前）

- [x] **Type Safety**: 三個新結構（`meta`、`cipher` 封包、`wrappedExamKey`）在兩端皆以 zod 定義並在邊界驗證。⚠️ 兩端 zod 主版本不同（`^3` vs `^4`）—— 見 Complexity Tracking C1。
- [x] **Async & Concurrency**: 開考時的金鑰索取是唯一的同時性尖峰，設計上以「廣播只傳事實、金鑰走小 payload」壓低。考卷本體的傳輸已移出該時刻。
- [x] **Security & Stability**: 本功能的主體即為安全性。威脅模型、已接受的風險與其緩解記於 `spec.md` Assumptions 與 `research.md` R2/R4。
- [x] **Low Coupling**: 階段規則收斂到單一 middleware；meta/cipher 的切分以「下游 0 處修改」為驗收條件（SC-009），確保加密層不滲入評測與 UI。
- [x] **Testability**: 矩陣可逐格斷言（13 端點 × 5 階段）；兩條金鑰路徑的等值性可自動測試；meta 的排除清單為可自動檢查的不變式。⚠️ 部分路徑無法自動化 —— 見 C2。

### 再評估（Phase 1 設計後）

- [x] **Type Safety**: `data-model.md` 每個實體皆有明確欄位與驗證規則；`contracts/` G25–G26 以共同 fixture 防止兩端靜默脫鉤。C1 已有緩解。
- [x] **Async & Concurrency**: `contracts/` G11 要求金鑰端點冪等，因此重試安全；G14 要求入場申請去重，避免全班同時重啟時佇列爆量寫入。
- [x] **Security & Stability**: G8（meta 排除清單）、G10（絕不廣播金鑰）、G13（拒絕無副作用）、G28（認證失敗即錯誤）皆為可測試的斷言，而非文件約定。
- [x] **Low Coupling**: `data-model.md` R10 的記憶體結構讓「開考前 `examConfig` 為 `null`」成為結構事實，下游不需新增階段檢查。
- [x] **Testability**: `quickstart.md` 將驗證分為自動化（A、E）與人工走查（B、C、D），每個 SC 皆有對應步驟。

**結論**：通過，兩項偏差記於 Complexity Tracking 並有緩解。

## Project Structure

### Documentation (this feature)

```text
specs/007-exam-lifecycle-state-machine/
├── plan.md              # 本檔
├── spec.md              # 需求（User Stories / FR / SC）
├── design.md            # 技術設計（先於 speckit 流程手寫，仍為權威細節來源）
├── research.md          # Phase 0 —— R1..R11 決策
├── data-model.md        # Phase 1 —— 實體、欄位、狀態轉移
├── quickstart.md        # Phase 1 —— 驗證指南
├── contracts/
│   └── exam-phase-api.md   # Phase 1 —— 端點、事件、保證 G1..G28
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2（/speckit-tasks，本指令不產生）
```

根目錄另有 `EXAM-LIFECYCLE.md` —— 以狀態圖、時序圖、流程圖說明兩端在每個階段的行為，供審定與現場人員閱讀。

### Source Code

**`host` repo**

```text
backend/src/
├── middlewares/
│   └── exam-phase.middleware.ts        # 新增 —— 階段權限矩陣，掛於 /user 根部
├── services/
│   ├── exam-state.service.ts           # 改 —— 五值域 + 轉移表驗證
│   ├── exam-config-crypto.service.ts   # 新增 —— meta/cipher 切分、K_exam、wrappedExamKey
│   ├── exam.service.ts                 # 改 —— config 端點回傳 {meta, cipher}
│   ├── init.service.ts                 # 改 —— 初始化時產生金鑰與切分
│   ├── device.service.ts               # 改 —— 拒絕無副作用、三種申請分類
│   ├── binding.service.ts              # 改 —— 核准時一次解完兩邊
│   └── system-settings.service.ts      # 改 —— 三個新 protected key
├── controllers/
│   ├── user/user.controller.ts         # 改 —— 新增 key、environment-report
│   └── admin/connection.controller.ts  # 改 —— 待審清單附判斷資訊
├── models/
│   ├── device-key-map.model.ts         # 改 —— 環境檢查與斷線時間欄位
│   └── login-request.model.ts          # 改 —— type 值域、previousTestId
├── routes/
│   ├── user/{index,user-exam}.route.ts # 改 —— 掛 middleware、新端點
│   └── admin/connection.route.ts       # 改 —— re-entry 端點
└── schemas/config.schema.ts            # 改 —— meta/secret/wrappedExamKey schema

backend/test/
├── fixtures/exam-config-payload.fixture.json   # 新增 —— 跨 repo 契約錨點
└── unit|integration/...                        # 對應新增

frontend/src/
├── types/config.ts                     # 改 —— submitGraceSeconds（schema 的第三份定義）
├── stores/
│   ├── manage.store.ts                 # 改 —— allowedNext、預設階段值
│   └── config.store.ts                 # 改 —— 預設 config、初始化後的階段值
└── views/
    ├── manage/components/
    │   ├── ExamStateControls.vue       # 改 —— 單一「下一階段」按鈕 + reset
    │   └── StudentReadiness.vue        # 新增 —— 準備狀況頁
    ├── config/
    │   ├── ConfigView.vue              # 改 —— 離線佈署檔匯出
    │   └── components/
    │       ├── GeneralSettingsEditor.vue   # 改 —— submitGraceSeconds 欄位、口令語意說明
    │       ├── ConfigForm.vue              # 改 —— 口令弱度警告與二次確認
    │       └── DbInitPanel.vue             # 改 —— 顯示前置條件缺項
    └── connection/ConnectionView.vue   # 改 —— 三種入場情境與指定學號

frontend/test/
└── fixtures/exam-config-payload.fixture.json   # 新增 —— 契約錨點第三份
```

**`desktop` repo**

```text
src/main/
├── schemas/examConfig.schema.ts        # 改 —— meta/secret schema + mergeExamConfig()
├── services/
│   ├── ramStore.service.ts             # 改 —— meta/cipher/examKey 欄位、清除程序
│   ├── config.service.ts               # 改 —— 離線佈署檔取代明文上傳
│   ├── crypto.service.ts               # 改 —— PBKDF2 導出、cipher 解密
│   ├── message-sync.service.ts         # 改 —— 開考後索取金鑰、reset 事件
│   ├── connection.service.ts           # 改 —— 真正的待送佇列
│   └── environment-check.service.ts    # 改 —— 結果上報
├── ipc/auth.ipc.ts                     # 改 —— 註冊自登入流程拆出
└── ...

src/renderer/
├── router/index.ts                     # 改 —— 推導式守衛、設定頁鎖定
└── pages/
    ├── StandbyPage.vue                 # 新增 —— INITIALIZED 待命畫面
    └── WaitingForExamPage.vue          # 改 —— 口令改為解密而非比對

test/fixtures/exam-config-payload.fixture.json   # 新增 —— 與 host 逐位元組相同
```

**Structure Decision**: 沿用兩個 repo 的既有結構，不引入新的頂層目錄。後端的新邏輯集中於一個 middleware 與一個 service，避免規則再度散落 —— 這正是本功能要修正的既有問題。桌面版的新結構刻意讓 `examConfig` 維持既有形狀，使 judger、UI 與 special rules 完全不需改動（SC-009）。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **C1** — 同一份契約有**三份**定義（後端 zod `^3`、學生端 zod `^4`、管理端 TypeScript type），非單一來源 | 兩個 repo 獨立版控、獨立套件管理，無法共用程式碼；管理端的設定編輯器另需一份可供表單綁定的 TypeScript type。zod 主版本已分歧，統一升級會牽動兩端既有的全部 schema，風險遠大於本功能 | *抽出共用 npm 套件*：需維護第三個發布流程，對兩個結構而言成本過高。*以 JSON Schema 產生 zod*：引入產生步驟與新工具。緩解為 G25/G26 的逐位元組相同 fixture + 三端各自的驗證測試 —— 這是 `experience.md` 第 4 條教訓在跨 repo 情境下的最佳近似。**此缺口已咬過一次**：`frontend/src/types/config.ts` 的註解記載 004 的同類漂移當時被記為 finding 而未處理，本次一併補上 |
| **C2** — 部分路徑無法達到憲法要求的 100% 自動化覆蓋 | 監考現場宣讀口令、隨身碟佈署、拔網路線、機器重啟，皆涉及人與實體硬體。這些正是本功能最關鍵的路徑（SC-002、SC-003） | *以 mock 模擬*：可覆蓋程式碼行，但無法證明「後端真的關掉時考試能開始」—— 而那正是需求本身。緩解為 `quickstart.md` B/C/D 三段人工走查，每個 SC 皆有對應步驟，且列為每個實作 Phase 的收尾條件 |
| **C3** — 跨 repo 的破壞性變更，無版本協商 | 考試機器一次性使用，每場重新佈署，因此不需要新舊並存。加入版本協商會為一個不存在的情境增加永久複雜度 | *保留舊 payload 形狀並漸進遷移*：需同時維護兩套考卷下發路徑，而其中一套（明文整份下發）正是本功能要消除的測資外洩面。代價為佈署必須原子化，記於 `EXAM-LIFECYCLE.md` 與 `quickstart.md` 前置條件 |


## 考前語言 API 與環境檢查增量（2026-10-14）

### Summary

新增 `POST /user/exam/languages`：已註冊裝置以既有 AES-GCM 封包索取目前考卷的去重語言清單，不需學生 session。桌面版成功註冊後背景取得清單並執行既有合成探針；取語言與執行檢查都不阻擋註冊成功、登入或合法階段切換。manage 沿用現有環境狀態、失敗語言與準備數，只補必要回歸測試及發現的接線缺陷。

線上檢查清單在本次裝置入場期間固定。考卷更新仍可正常下載，但不變更該清單或自動重檢。考前改語言後由現場重啟桌面版，按既有入場流程取得最新清單；已關閉自助註冊時仍需助教核准。離線檔案流程維持原有檢查來源。

### Technical Context

- **Language/Version**：後端 TypeScript ^5.4.5、Node >=20.19；管理端 TypeScript ~6.0.2；桌面版 TypeScript ^5.5.2、Electron ^34.5.8。此處為目前 package.json 宣告，取代基線的 Electron 31 描述。
- **Dependencies**：沿用 Express 4、Sequelize 6、Socket.IO 4、後端 Zod 3／桌面版 Zod 4、Vue 3、Vuetify；不新增套件。
- **Storage**：後端由已驗證 exam_config 推導語言，不增加資料表或儲存重複清單。沿用 DeviceKeyMap 環境欄位。桌面版新增 RAM-only 語言快照與檢查世代、待回報資料。
- **Testing**：後端與管理端 Vitest 4，桌面版 Vitest 3；兩端邊界 schema 加共同契約 fixture；整合驗證須使用真實裝置加密封包，不能只跑 pure load-test 模式。
- **Target/Scope**：現有 Linux/Docker 後端、Windows/macOS 桌面版，約 40–60 台；一個讀取 API、既有檢查生命週期接線及 readiness 回歸。
- **Performance**：每次有效裝置入場只接受一次清單；每個檢查 run 單一執行，不並行重複跑。後端僅讀設定與投影語言，不執行編譯器。檢查留在背景，登入不等待。清單大小受五個既有語言限制。
- **Constraints**：失敗僅提示；不新增設定完成門檻；不擴大題目資訊暴露；語言變更不推播或自動刷新快照；reset／換後端／重新入場須取消舊工作。這次規劃不變更程式或桌面版 repo。

### Constitution Check — Phase 0 與 Phase 1

| Gate | Phase 0 | Phase 1 設計證據 |
|---|---|---|
| Type Safety | 可通過 | 封包、解密後請求、語言清單以 schema 驗證；unknown 收窄，新增路徑不得沿用 any 或靜默過濾未知語言；契約 fixture 防止跨 repo 漂移 |
| Async & Concurrency | 可通過 | 背景檢查、單次執行、取消世代、序列回報、連線恢复重送；不增加全場編譯負載到後端 |
| Strict Branching | 通過 | 已由 develop 切至 feat/007-environment-precheck-plan，保留工作區修改；未提交 develop。桌面版實作亦須 feat 分支 |
| Security & Stability | 可通過 | 裝置金鑰驗證＋nonce/timestamp；逐階段拒絕；只投影語言；不讓 reset 前結果寫回新狀態 |
| Low Coupling | 可通過 | 語言取得與考卷解密分離；保留合成探針與 readiness 模型；不引入新評測器 |
| Testability | 可通過 | 全專案以 100% 行覆蓋為合併要求，另做真實工具鏈與跨端走查；尚未執行，不宣稱覆蓋已達標 |

Phase 1 設計檢查通過，無新增未解決 gate。原始計畫 C1 的多份 schema 以 fixture 緩解持續適用；人工硬體走查是自動化測試之外的驗收，不取代程式碼覆蓋要求。

### Project Structure 與變更邊界

| 區域 | 預定變更 |
|---|---|
| backend/src/routes/user/user-exam.route.ts | 註冊語言路由 |
| backend/src/middlewares/exam-phase.middleware.ts | 加入語言端點三個允許階段 |
| backend/src/controllers/user/user.controller.ts、services/exam.service.ts | 具型別的装置驗證、語言投影與加密回應；新路徑不使用 pure 模式免驗證分支 |
| backend/src/schemas/ | 語言請求／回應 schema，使用既有語言集合；抽取 typed decoder 時回歸現有呼叫者 |
| backend/test/ | API、schema、階段矩陣、重放與未註冊拒絕、readiness 測試及 fixture |
| frontend/test/student-readiness.test.ts | FAILED 優先、登入不掩蓋、RUNNING/UNKNOWN 不通過、修復後更新 |
| ../desktop/src/main/services/api.service.ts | 無學生 session 的裝置加密語言 client，驗證回應 |
| ../desktop/src/main/ipc/auth.ipc.ts | 成功註冊後啟動背景準備，錯誤不改寫註冊結果 |
| ../desktop/src/main/services/environment-check.service.ts | typed applyLanguages、快照重試、單次執行、回報重送與世代取消 |
| ../desktop/src/main/services/config.service.ts | 線上考卷載入不再等待／觸發環境檢查；離線來源保留 |
| ../desktop/src/main/services/message-sync.service.ts、ramStore.service.ts | reset／重新入場取消舊工作；連線恢复重送；config_update 不刷新快照 |
| ../desktop/src/renderer/router/environment-check.guard.ts、router/index.ts | 移除環境檢查對登入的限制，保留階段與身分限制 |
| ../desktop/test/ | 註冊、路由、預檢、回報、reset 競態、離線回歸及共同 fixture |

### 實作順序與驗收

1. API schema、fixture、裝置驗證、語言投影、階段矩陣與安全測試（FR-044、048）。
2. 桌面版背景取得、RAM 快照與探針啟動、重試、取消與離線隔離（FR-045、049）。
3. 移除登入環境 gate；回報序列、補送與 manage 全鏈驗證（FR-046、047）。
4. 執行 quickstart 新增 F 段與既有生命週期回歸；後端與桌面版一起部署。

任務與實作已接續進行；保留舊任務完成狀態，新增工作與實際驗證見 tasks.md、validation.md。
