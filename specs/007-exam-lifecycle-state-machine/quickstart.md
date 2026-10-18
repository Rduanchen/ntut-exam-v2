# Quickstart: Validating the Exam Lifecycle and Paper Encryption

**Feature**: `007-exam-lifecycle-state-machine`　**Date**: 2026-09-04

本檔是**驗證指南**，不是實作指南。它描述如何證明本功能端到端可用。實作細節見 `tasks.md`，設計見 `design.md` 與 `contracts/`。

---

## 前置條件

| 項目 | 需求 |
|---|---|
| `host` repo | 分支 `feat/007-exam-lifecycle-state-machine`，Node ≥ 20.19，pnpm |
| `desktop` repo | 分支 `feat/003-exam-lifecycle-state-machine`，Node ≥ 20，npm |
| 兩者關係 | **必須同時佈署**。舊桌面版連新後端（或反之）會直接失敗 |
| 考卷 | 一份含至少兩種語言、每題有 visible 與 hidden 測資的 `exam_config` |
| 監考口令 | 記在 `config` 的 `environmentVariables.startPassword`，**不寫在任何交給學生的檔案裡** |

```bash
# host
cd ~/Documents/ntut-exam-v2/host
pnpm install
pnpm test                    # 後端測試（含型別檢查）
pnpm dev:backend             # 另開終端
pnpm dev:frontend            # 另開終端

# desktop
cd ~/Documents/ntut-exam-v2/desktop
npm install
npm test
npm run dev
```

---

## A. 自動化驗證

### A1. 跨 repo 契約 fixture（G25、G26）

這是唯一同時保護兩個 repo 的測試，**每次修改契約後都必須跑**。

```bash
H=~/Documents/ntut-exam-v2/host
D=~/Documents/ntut-exam-v2/desktop

# 確認三份 fixture 逐位元組相同
diff $H/backend/test/fixtures/exam-config-payload.fixture.json \
     $D/test/fixtures/exam-config-payload.fixture.json
diff $H/backend/test/fixtures/exam-config-payload.fixture.json \
     $H/frontend/test/fixtures/exam-config-payload.fixture.json
# 預期：兩次皆無輸出

cd $H && pnpm test                      # 後端 zod ^3 驗證
cd $H && pnpm --filter frontend test    # 管理端 TypeScript type 驗證
cd $D && npm test                       # 學生端 zod ^4 驗證
```

**預期**：兩次 `diff` 皆無差異，三端測試皆綠。

> config schema 有**三份**定義：後端 zod `^3`、學生端 zod `^4`、管理端 TypeScript type。zod 主版本不同，且管理端根本不是 runtime schema —— 此測試的目的即為讓三者的差異在此暴露，而非在考試現場。
>
> 這個缺口已經咬過一次：`frontend/src/types/config.ts` 的註解記載 feature 004 新增欄位後，該型別描述了舊 schema 一段時間而無人察覺。

### A2. 階段轉移的單向性（G4）

```bash
cd ~/Documents/ntut-exam-v2/host && pnpm test -- exam-state
```

**預期**：合法轉移全數通過；跳階、回退、`from === to` 全數被拒。矩陣中 20 種組合逐一有斷言。

### A3. meta 的排除清單（G8）

```bash
cd ~/Documents/ntut-exam-v2/host && pnpm test -- exam-config-crypto
```

**預期**：以真實考卷產生的 `config.meta` 序列化後，不含 `"input"`、`"output"`、`puzzles[].title`、`puzzles[].score`、`subtasks`、`specialRules`、`startPassword` 任一字串。此為可自動斷言的不變式。

### A4. 兩條金鑰路徑導出同一把金鑰（G27）

```bash
cd ~/Documents/ntut-exam-v2/host && pnpm test -- exam-key
```

**預期**：`POST /user/exam/key` 回傳的金鑰，與 `AES-GCM-decrypt(wrappedExamKey, PBKDF2(口令, salt))` 的結果逐位元組相同。

### A5. 階段權限矩陣（G2、G3、SC-006）

```bash
cd ~/Documents/ntut-exam-v2/host && pnpm test -- exam-phase
```

**預期**：`contracts/exam-phase-api.md` §2 表格的每一格都有對應斷言 —— 13 個端點 × 5 個階段。標示 ✗ 的組合必須回 `409`。

---

## B. 六階段人工走查

**每個實作 Phase 結束都必須跑一次。** 自動化測試不能取代這一段 —— 它驗證的是兩端合起來的行為。

準備兩台機器（或兩個桌面版實例）：`機器 A`、`機器 B`。

| # | 操作 | 預期 | 對應 |
|---|---|---|---|
| 1 | 後端啟動，尚未初始化 | 兩台停在等待畫面；任何註冊／登入嘗試被拒 | US1-1 |
| 2 | 管理端上傳考卷、初始化 | 成功；`allowedNext` 為 `INITIALIZED` | G5 |
| 2b | 在設定編輯器檢視一般設定頁 | 看得到 `submitGraceSeconds` 欄位；`startPassword` 的說明已改為「考卷解密金鑰」 | T068–T071 |
| 2c | 將口令改為 3 個字元後儲存 | 出現弱度警告並要求二次確認 | R4 / T072 |
| 3 | 推進到 `INITIALIZED` | 兩台自動註冊成功 | US1-2 |
| 4 | 觀察兩台 | 自動執行環境檢查；**畫面上沒有登入入口** | US1-2 |
| 5 | 檢視管理端 | 顯示已註冊機器數與環境檢查通過數 | R9 |
| 6 | **檢查機器 A 的記憶體狀態** | 持有 `meta` 與 `cipher`；`examConfig` 為 `null`；**0 筆測資可讀** | **SC-001** |
| 7 | 推進到 `SETUP_FINISHED` | 兩台出現登入畫面 | US1-4 |
| 8 | 啟動第三台 `機器 C` | 註冊被拒，管理端出現 `NEW_DEVICE` 待審 | US1-3 |
| 9 | 機器 A 登入 | 成功；管理端該生顯示為已就緒 | US1-4 |
| 10 | **再次檢查機器 A** | **仍然 0 筆測資可讀**（已登入但未開考） | **SC-001** |
| 11 | 嘗試推進到 `INITIALIZED` | 被拒 | US1-5 |
| 12 | 嘗試從 `SETUP_FINISHED` 跳到 `FINISHED` | 被拒 | US1-6 |
| 13 | 機器 B 登入，推進到 `IN_PROGRESS` | 兩台自動取得金鑰、解密、進入考試畫面 | US2-3 |
| 14 | 兩台各提交一題 | 成功 | — |
| 15 | **拔掉機器 A 的網路** | 作答、評測、計分完全不受影響 | US4-3 |
| 16 | 斷線期間再評測、再提交一題 | 本機成功；佇列累積 | — |
| 17 | 接回網路 | 期間的結果自動補送，**不需學生操作** | **SC-008** |
| 18 | **重啟機器 A** | 自動申請入場，管理端出現 `REBIND` 待審 | US3-1 |
| 19 | 檢視該待審記錄 | 顯示原綁學號、是否他機在線、上次斷線時間、IP 是否相符 | G16 / SC-007 |
| 20 | 助教核准 | 機器 A 重新註冊 → **執行環境檢查** → 登入 | US3-4 |
| 21 | 觀察機器 A | 回到考試畫面，**已提交的作答完整復原** | **SC-002** |
| 22 | 比對機器 A 的分數 | 與重啟前完全相同 | US3-3 |
| 23 | 推進到 `FINISHED` | 兩台進入結束畫面；緩衝期內仍可完成上傳 | US1 / FR-033 |
| 24 | 緩衝期結束後嘗試提交 | 後端拒絕（不只是前端擋） | FR-034 |
| 25 | 執行全域 reset | 兩台清空所有狀態並回到等待畫面 | US5-2 |
| 26 | **檢查機器 A** | 身分、考卷、金鑰、評測結果、作答暫存全數清除 | data-model §8 |
| 27 | 重新初始化，兩台再次註冊 | **成功，無需任何人工介入** | **SC-005** |

**第 6、10、26 步是本功能的核心驗收**，不可省略。

### 如何檢查「0 筆測資可讀」（第 6、10 步）

在桌面版開發者工具的主行程環境檢視 `ramStore`：

```
ramStore.examConfig          → null            （尚未解密）
ramStore.examConfigMeta      → 物件，無測資欄位
ramStore.examConfigCipher    → { iv, ciphertext, tag }
ramStore.examKey             → null
```

並確認 `JSON.stringify(ramStore.examConfigMeta)` 不含任何題目敘述或測資內容。

---

## C. 全程離線走查

**Phase 2 完成後必跑。** 驗證 `spec.md` US4 與 SC-003。

| # | 操作 | 預期 |
|---|---|---|
| 1 | 管理端匯出離線佈署檔 | 產生 `{ meta, cipher }` JSON |
| 2 | 檢視該檔案 | **不含 `K_exam`、不含口令明文** |
| 3 | 準備一台從未連過後端的機器 `機器 D` | — |
| 4 | 監考在該機載入佈署檔 | 進入離線模式 |
| 5 | 機器 D 執行環境檢查 | 通過（meta 已含語言清單與資源上限） |
| 6 | 手動輸入學號登入 | 成功（比對 meta 的名單） |
| 7 | **關閉後端服務** | — |
| 8 | 輸入**錯誤**的口令 | 開考失敗，考卷仍不可讀 |
| 9 | 輸入**正確**的口令 | 開考成功，考卷完整可讀 |
| 10 | 完整作答、評測 | 全部正常 |
| 11 | 後端仍關閉時到達結束時間 | 由監考人工宣布、逐台收卷（已接受的降級） |

**第 7–9 步是 SC-003 的核心**：後端完全不可用時，仍有 100% 的機器能開考。

---

## D. 安全性驗證

| # | 檢查 | 預期 |
|---|---|---|
| 1 | 以 `SETUP_FINISHED` 階段呼叫 `POST /user/exam/key` | `409`，且回應不透露金鑰是否存在（G9） |
| 2 | 監聽 socket，觀察開考廣播 | payload 不含金鑰或任何可導出金鑰的資訊（G10、G19） |
| 3 | 以他人的 `device_uuid` 送出註冊請求 | 被拒，且**被冒用者的裝置狀態完全不變**（G13、US6-4） |
| 4 | 同一裝置連送三次註冊請求 | 只產生一筆待審（G14） |
| 5 | 竄改 `cipher` 的一個位元組後解密 | 拋出錯誤，不得回退為空考卷（G28） |
| 6 | 考試中在桌面版嘗試進入設定頁 | 無法進入（FR-008） |
| 7 | 檢視離線佈署檔與 `config.meta` | 兩者皆無 `startPassword` 明文（G8、G23） |

---

## E. 回歸驗證

**G — 下游 0 處修改**（SC-009）：合併還原後的考卷必須與現行結構等價。

```bash
cd ~/Documents/ntut-exam-v2/desktop && npm test
```

**預期**：judger、UI 呈現、special rules 的既有測試**完全不需修改即通過**。若任何一項需要調整，代表 meta/cipher 的切分位置錯誤，應回頭修正切分而非修改下游。

---

## 驗收總表

| 指標 | 驗證方式 |
|---|---|
| SC-001 開考前 0 筆測資可讀 | B-6、B-10 |
| SC-002 重啟後一次核准即回到考試，作答 100% 復原 | B-18 ~ B-22 |
| SC-003 後端不可用時 100% 機器能開考 | C-7 ~ C-9 |
| SC-004 開考傳輸量 < 考卷的 1% | 比較 `POST /user/exam/key` 與 `POST /user/exam/config` 的回應大小 |
| SC-005 reset 後重新註冊成功率 100% | B-25 ~ B-27 |
| SC-006 不允許的操作 100% 被拒 | A5 |
| SC-007 助教不需查詢其他畫面 | B-19 |
| SC-008 斷線期間結果 100% 補送 | B-15 ~ B-17 |
| SC-009 下游 0 處修改 | E |


## F. 考前語言與環境檢查增量驗收（2026-10-14）

以本節驗收 FR-044–049、SC-015–017；舊 B 段「環境檢查 → 登入」表示會啟動檢查，不表示須通過才能登入。本節在增量實作完成後執行，本次規劃未宣稱下列驗證已通過。

### F1. 準備與自動化

沿用本文件前置條件，host 使用 `feat/007-environment-precheck-plan` 的後續實作，desktop 使用含配套變更的 feat 分支。使用可清空的測試場次、兩台桌面機、一份至少兩種語言的考卷。安裝依賴後依序執行：

```bash
# host 根目錄；pnpm test 含 fixture 同步檢查與後端測試型別檢查
pnpm test
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter backend test:coverage
pnpm --filter frontend test:coverage
pnpm dev:backend
# 另一終端：pnpm dev:frontend

# desktop 根目錄
npm run typecheck
npx vitest run
RUN_ENVIRONMENT_CHECK_INTEGRATION=1 npx vitest run test/integration/environment-check.runtime.test.ts
npm run dev
```

新語言 API 的測試應納入 backend test suite；測試內容見 [契約](contracts/environment-precheck-api.md#5-契約驗證)。核對新增／修改路徑的行覆蓋達 100%，既有全域缺口須如實列出，不以測試綠燈取代覆蓋報告。runtime 測試在缺工具鏈時可能略過，因此仍需 F2 真機驗收，不得把略過當成功。

### F2. 首次註冊與警示鏈

1. 上傳測試考卷並初始化，後端維持 INITIALIZED，不登入學生。
2. 啟動桌面版，觀察註冊成功後取得語言並自動開始檢查；不得等管理員按「設定完成」。確認 API 僅傳所需語言，無題目、測資、口令或金鑰（SC-015）。
3. 第二台機器刻意使一個應試語言的編譯器不可用，確認檢查 FAILED 且本機指出問題。
4. 在檢查 RUNNING 時及 FAILED 後，分別推進至 SETUP_FINISHED 並登入。登入不得被檢查狀態阻擋；入場身分規則仍適用。
5. 在 manage 學生準備狀況確認已綁定學生的失敗警示與失敗語言；登入成功不能掩蓋。未綁學生前不要求在某位學生列上顯示機器結果。
6. 修复環境，按 retry。應使用既有快照，不需解密考卷；manage 顯示進行中／尚未通過，成功回報後轉為 PASSED（SC-016）。

### F3. 語言更新採重啟流程

1. 在允許編輯的考前階段，將考卷語言集合改成包含另一語言；若目前 config 編輯 API 禁止此變更，以測試 fixture/mock 驗證該事件，另在新場次驗證真機取得；不得放寬既有考卷編輯規則。
2. 原桌面版維持啟動：config_update 可更新考卷，檢查清單／已回報結果不自動改變；按 retry 仍檢查原清單。
3. 重啟桌面版，按既有入場流程註冊；若註冊已關閉，由助教核准。確認取得最新語言、逐項檢查及更新 manage（SC-017）。

### F4. 故障與回歸

- 初次語言請求失敗：本機呈現無法檢查，不以 [] 假裝通過；登入及合法階段切換不因此被擋，恢復連線可重試取得。
- 回報時斷線：本機結果可見；重連後最新結果送達 manage，不被延遲 RUNNING 覆蓋。
- 檢查進行中全域 reset：機器回起點；舊 runner 完成／回報不可污染新場次。新場次同 UUID 註冊仍不接受舊金鑰回報。
- API 安全：透過整合測試傳真實 AES 封包，驗證未註冊、錯 key、重放、過期與禁用階段均被拒；不依賴 pure load-test 模式。
- 離線考卷載入與監考口令開考、考中重新入場，沿用 B/C/D 回歸；語言新增功能不得移除原流程。

保存測試輸出、覆盖報告及每個人工案例結果；未執行或略過的項目明確標記。

### 本增量配對部署

配對分支：host `feat/007-environment-precheck-plan`（基線 `3d80736ccbaa99a9548dbfa8722c69b540406e79`），desktop `feat/007-environment-precheck`（基線 `c505567a644d6b98172530294c65fca5d115d14a`）。目前是未發佈工作區增量，尚無可宣稱的 release tag。部署需包含兩端本次變更，禁止搭配缺少回報 sequence 的舊桌面版。後端會補 env_check_sequence 欄位；正式部署仍須先備份資料庫。考前變更語言後，重新啟動桌面版並依原規則完成入場審核。

2026-10-19 配對驗證更新：host 使用 `develop`（含遠端主線整合及本規格的非真機補測），desktop 使用 `feat/007-environment-precheck` 的 `7684649`。兩端都尚未推送為配對 release；正式部署前應在 PR／release 紀錄寫入最終兩個 commit SHA，不能只寫分支名。桌面端改考卷語言後不熱更新成功快照；必須重啟，重新註冊，註冊關閉時由助教依原規則核准。此作業不會取消學生位置綁定。
