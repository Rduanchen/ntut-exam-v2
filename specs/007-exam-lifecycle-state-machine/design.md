# 考試生命週期狀態機與考卷加密規格

**Feature Branch**: `007-exam-lifecycle-state-machine`

**Created**: 2026-09-04

**Status**: Draft — 待審定

**Scope**: 定義考試系統的全域階段、階段之間的轉移與退回、學生端狀態的推導方式、考卷與測資的兩層加密與下發時機，以及後端不可用時的降級程序。涵蓋後端 (`host/backend`) 與桌面版 (`desktop`) 兩側。

> 本文以中文撰寫（既有 specs 為英文），因為它的首要用途是設計審定。實作階段的 plan/tasks 可再轉為英文。

---

## 1. 目的

現況的問題有三個：

1. **階段切分不明確** —— 後端只有四個狀態，其中 `NOT_STARTED` 同時承擔「已初始化、開放註冊」與「準備登入、禁止註冊」兩種語意，導致「什麼階段允許什麼操作」無處可掛。
2. **退回不明確** —— 後端 reset 之後客戶端幾乎不清任何狀態；階段轉移沒有方向性約束，任意兩個狀態之間都能跳。
3. **測資安全沒有階段性** —— 考卷（含 hidden 測資）在學生登入成功的當下即以明文進入學生機器的 RAM，而登入發生在開考之前。

本規格用一個五階段的單向狀態機、一組推導式的學生端狀態，以及兩層加密的考卷下發模型，同時解決這三件事。

---

## 2. 設計原則

這五條是後續所有條文的依據，衝突時以本節為準。

| 原則 | 說明 |
|---|---|
| **P1 全域階段單向** | 階段只能前進一步，不可跳階、不可回退。唯一的例外是全域 reset。 |
| **P2 學生端狀態是推導值** | 學生端沒有獨立的狀態機。學生端階段 = f(全域階段, 本機裝置的註冊與綁定狀態)。學生永遠不會停在中間態。 |
| **P3 只有一條工序** | 不為異常情況維護第二條流程。學生機器重啟、換機、助教手動重置，走的都是與正常入場**完全相同**的路徑，包含環境檢查。 |
| **P4 開考與結束不得依賴後端可用** | 後端可以讓考試提前開始或提前結束，但後端不可用不得使考試無法開始。（結束的降級為人工程序，見 §9.2） |
| **P5 測資的保護與傳輸分離** | 裝置 AES 金鑰保護傳輸（防旁人、防他機），考卷金鑰 `K_exam` 保護內容（防持有機器的人提前閱卷）。前者不能兼任後者。 |

---

## 3. 名詞定義

| 名詞 | 定義 |
|---|---|
| **全域階段** | 後端持有的單一考試階段，存於 `SystemSettings.exam_state`，透過 socket 廣播與輪詢同步到所有客戶端。 |
| **裝置 AES 金鑰** | 每台裝置註冊時產生的 256-bit 金鑰，客戶端保存在 RAM（永不落盤），後端存於 `DeviceKeyMap.clientAesKey`。用於請求的加解密。 |
| **`K_exam`（考卷金鑰）** | 每場考試一把的 256-bit 隨機金鑰，由後端在初始化時產生並扣留。用於加解密考卷內容。 |
| **開考口令** | `config.environmentVariables.startPassword`。本規格將其升格為 `K_exam` 的包裝金鑰（見 §7.3）。 |
| **`config.meta`** | 考卷的公開部分。開考前即可離開後端。 |
| **`config.cipher`** | 考卷的機密部分（題目敘述、所有測資、特殊規則），以 `K_exam` 加密後的密文。 |
| **重來 (Re-entry)** | 單一學生/裝置清除身分層狀態後，重走一次完整入場流程。不是階段退回。見 §6。 |
| **全域 reset** | 唯一的退回通道。清空所有資料並回到 `UNINITIALIZED`。見 §5.2。 |

---

## 4. 全域階段

狀態字串一律改名如下（取代現有的 `UNINITIALIZED / NOT_STARTED / IN_PROGRESS / FINISHED`）。

### 4.1 `UNINITIALIZED`

**意義**：後端尚未初始化。無名單、無考卷、無 `K_exam`。

| 面向 | 規定 |
|---|---|
| 裝置註冊 | 拒絕 |
| 登入 | 拒絕 |
| `config.meta` / `config.cipher` 下發 | 拒絕 |
| `K_exam` 下發 | 拒絕 |
| 提交程式碼 / 分數 | 拒絕 |
| 桌面版畫面 | `/not-initialized`，輪詢等待後端 |

**進入條件**：系統初始狀態，或全域 reset 之後。

### 4.2 `INITIALIZED`

**意義**：設定完成，開放考試機器自助註冊。**此時學生尚未入場。**

| 面向 | 規定 |
|---|---|
| 裝置註冊 | **開放**，自助完成，無需助教 |
| 登入 | 拒絕 |
| `config.meta` / `config.cipher` 下發 | **開放**，憑已註冊裝置即可取得（不需 session token） |
| `K_exam` 下發 | 拒絕 |
| 提交程式碼 / 分數 | 拒絕 |
| 桌面版畫面 | 註冊 → 取得 meta 與密文 → 執行環境檢查 → 待命畫面（不提供登入入口） |

**進入條件**（由管理員在後端觸發，全部成立才允許）：

1. `exam_config` 已上傳並通過 schema 驗證
2. 資料庫初始化完成（`User` 與 `ScoreBoard` 已依名單建立）
3. `K_exam` 已產生並存入 `SystemSettings`
4. `config.cipher` 與 `wrappedExamKey` 已產生

**副作用**：`allow_device_registration = true`

### 4.3 `SETUP_FINISHED`

**意義**：註冊閘門關閉，開放登入。學生入場、就座、登入、等待開考。

| 面向 | 規定 |
|---|---|
| 裝置註冊 | **關閉**。新的註冊請求一律建立助教待審記錄並拒絕（見 §6.2） |
| 登入 | **開放** |
| `config.meta` / `config.cipher` 下發 | 開放（憑已註冊裝置） |
| `K_exam` 下發 | 拒絕 |
| 提交程式碼 / 分數 | 拒絕 |
| 桌面版畫面 | 登入畫面 → 自動 IP 登入 → 失敗退回手動輸入學號 → 登入成功後進入等待畫面 |

**進入條件**：管理員手動觸發。

**副作用**：`allow_device_registration = false`

**Ready 的定義**：一位學生「已就緒」= 全域階段為 `SETUP_FINISHED` ∧ 其裝置 `DeviceKeyMap.status === 'ONLINE'` ∧ 已綁定 `testId` ∧ 已上報環境檢查結果。這是推導值，不是獨立狀態（P2）。後端的準備狀況頁以此呈現。

### 4.4 `IN_PROGRESS`

**意義**：考試進行中。

| 面向 | 規定 |
|---|---|
| 裝置註冊 | 關閉（同 `SETUP_FINISHED`） |
| 登入 | **開放**（重來路徑必須能重新登入，見 §6） |
| `config.meta` / `config.cipher` 下發 | 開放 |
| `K_exam` 下發 | **開放** |
| 提交程式碼 / 分數 | **開放** |
| 桌面版畫面 | 考試畫面 |

**進入條件**：管理員手動觸發（開考）。

### 4.5 `FINISHED`

**意義**：考試結束。

| 面向 | 規定 |
|---|---|
| 裝置註冊 | 關閉 |
| 登入 | 拒絕 |
| `config.meta` / `config.cipher` 下發 | 拒絕 |
| `K_exam` 下發 | 拒絕 |
| 提交程式碼 / 分數 | **收卷緩衝期內開放，緩衝結束後拒絕**（見下） |
| 桌面版畫面 | 結束畫面（緩衝期內仍可停留在考試畫面完成最後上傳） |

**進入條件**：管理員手動觸發（強制結束）。

**收卷緩衝**：沿用桌面版既有的 `bufferState` 機制。`FINISHED` 廣播後的緩衝時間 `T_buffer` 內，後端仍接受 `SUBMIT_CODE` 與 `SUBMIT_SCORE`。

> **待對齊**：`T_buffer` 目前只存在於桌面版前端常數，後端完全不檢查。實作時須將其設為後端與桌面版共用的單一來源，並由後端實際執行「緩衝結束後拒絕」。

---

## 5. 階段轉移

### 5.1 轉移表

```
UNINITIALIZED ──▶ INITIALIZED ──▶ SETUP_FINISHED ──▶ IN_PROGRESS ──▶ FINISHED
      ▲                │                │                 │              │
      └────────────────┴────────────────┴─────────────────┴──────────────┘
                              全域 reset（唯一退回通道）
```

| 來源 | 目標 | 允許 | 觸發者 |
|---|---|---|---|
| `UNINITIALIZED` | `INITIALIZED` | ✅ | 管理員（需滿足 §4.2 四項前置） |
| `INITIALIZED` | `SETUP_FINISHED` | ✅ | 管理員 |
| `SETUP_FINISHED` | `IN_PROGRESS` | ✅ | 管理員 |
| `IN_PROGRESS` | `FINISHED` | ✅ | 管理員 |
| 任一階段 | `UNINITIALIZED` | ✅ | 全域 reset（§5.2） |
| 其他任何組合（含跳階、回退、原地） | — | ❌ 一律拒絕 | — |

**強制規則**：

- 階段轉移必須由後端服務層驗證，不可只靠 UI 限制。目前 `AdminExamStateController.changeState` 只驗證字串是否為合法 enum，任意兩狀態間都能跳 —— 必須改為查表。
- 管理端 UI 只呈現「下一階段」一顆按鈕與「reset」，不再列出四顆任選的階段按鈕。
- reset 不是一次階段轉移，是獨立的通道，兩者在程式碼中必須可區分（目前 `wipeAllData()` 透過 `changeState(UNINITIALIZED)` 走同一條路，無法區分）。

### 5.2 全域 reset

**觸發**：`POST /admin/init/reset`，需確認字串。

**後端行為**（依序）：

1. 清空所有考試資料表（`Submission` / `ScoreBoard` / `ViolationLog` / `UserActionLog` / `Message` / `User` / `DeviceKeyMap` / `LoginRequest` / `UnblockedDevice`）
2. 清除 `K_exam`、`config.cipher`、`wrappedExamKey`
3. `allow_device_registration = false`
4. 階段設為 `UNINITIALIZED`
5. 廣播 reset 事件（**與一般階段廣播區分**，見下）

**廣播的區分**：一般階段轉移廣播 `namespace: "STATUS"`；reset 必須使用獨立的事件型別（例如 `namespace: "RESET"`），因為客戶端對兩者的處理完全不同。目前兩者共用同一條路徑，是客戶端不清狀態的根因。

**客戶端收到 reset 後必須清除的完整清單**：

| 項目 | 現況是否清除 |
|---|---|
| `examStatus` → `UNINITIALIZED` | ✅ 已清 |
| `isStudentVerified` | ❌ **未清** |
| `studentInfo` | ❌ **未清** |
| `cryptoState`（裝置 AES 金鑰與 session token） | ❌ **未清** |
| `examConfig`（已解密的考卷） | ❌ **未清** |
| `config.cipher`（密文）與 `K_exam` | ❌ 新增項目 |
| `environmentCheckReport` | ❌ **未清** |
| `testResults` / `highestTestResults` / `specialRuleResults` | ❌ **未清** |
| `localProgramStore` 暫存目錄 | ❌ **未清** |
| `messageVersion` / `configVersion` / `notifications` | ❌ **未清** |
| `isOfflineMode` / `pendingLoginSync` | ❌ **未清** |

清除完成後導向 `/not-initialized` 並重新開始輪詢。

> 現況 `message-sync.service.ts` 收到 `STATUS` 廣播時只更新 `examStatus`，其餘一律不動。因此後端 reset 之後，客戶端仍持有已失效的 AES 金鑰（後端 `DeviceKeyMap` 已清空），所有加密請求將回 401，且沒有自動重新註冊的路徑。這是本規格要修正的首要缺陷。

---

## 6. 學生端狀態與「重來」

### 6.1 學生端狀態是推導值

學生端不維護獨立的階段。畫面由下列推導決定：

```
if 全域階段 == UNINITIALIZED        → /not-initialized
if 全域階段 == INITIALIZED          → 註冊/環境檢查/待命畫面（無登入入口）
if 全域階段 == SETUP_FINISHED       → 未登入 ? 登入畫面 : 等待畫面
if 全域階段 == IN_PROGRESS          → 未登入 ? 登入畫面 : 考試畫面
if 全域階段 == FINISHED             → 結束畫面（緩衝期內允許停留於考試畫面）
```

推論：**學生端不需要「退回」的概念**。清掉身分層狀態之後重新推導，自然會落在正確的位置。

### 6.2 重來 (Re-entry)

**定義**：清除單一裝置的身分層狀態，然後重走一次與正常入場**完全相同**的流程。全域階段不受影響，其他學生不受影響。

**兩種觸發方式，行為完全相同**：

1. **自然發生** —— 學生機器重啟。裝置 AES 金鑰隨 RAM 消失，客戶端下次啟動必然重新註冊。
2. **助教觸發** —— 助教在後端對某裝置執行重來（`unregisterDevice` + `forceLogoutDevice`）。用於換機、誤登他人學號等情況。

**清除邊界**（這是重來規格的核心）：

| 層 | Key | 重來時 |
|---|---|---|
| **身分層** | `deviceUuid` | **清除**：裝置 AES 金鑰、註冊紀錄、裝置↔學號綁定、session token、客戶端 RAM 中的身分與考卷（含密文與 `K_exam`）、環境檢查報告 |
| **成果層** | `testId` | **保留**：`Submission`（已提交的程式碼）、`ScoreBoard`（分數） |

**重來後的流程**（與正常入場逐步相同，不開特例 —— P3）：

1. 客戶端產生新的 AES 金鑰，向後端註冊
2. 因全域階段已 ≥ `SETUP_FINISHED`，註冊閘門關閉 → 建立助教待審記錄並拒絕
3. 助教核准 → 客戶端重新註冊成功
4. 取得 `config.meta` 與 `config.cipher`
5. **執行環境檢查**（與正常流程相同，同樣會擋住後續步驟直到完成）
6. 登入（自動 IP 登入，失敗則手動輸入）
7. 登入成功 → 後端回送 `Submission`，客戶端復原已提交的程式碼
8. 若全域階段為 `IN_PROGRESS`，取得 `K_exam` → 解密考卷 → 直接進入考試畫面

**重來不繞過任何閘門。** 它是重新從閘門進來，因此助教核准仍是必經之路，安全模型不變。

### 6.3 助教核准的三種情境

註冊被閘門擋下時，建立的待審記錄必須讓助教能區分下列三種情境。目前 `LoginRequest.type` 只有 `FIRST_TIME` / `SECONDARY` 兩種，情境 A 與 C 會混在一起，需擴充。

| 情境 | 判別條件 | 助教可選的處置 |
|---|---|---|
| **A. 已綁考生的裝置重新註冊** | `DeviceKeyMap` 存在且 `testId != null` | ① 允許原學號登入 ② 允許改綁新學號（同時解除該裝置與原學號、以及新學號與其原裝置的綁定） |
| **B. 全新裝置註冊** | `DeviceKeyMap` 不存在 | 允許 / 拒絕綁定 |
| **C. 已註冊但未綁考生的裝置** | `DeviceKeyMap` 存在且 `testId == null` | 允許 / 拒絕綁定 |

**待審記錄需附帶的判斷資訊**（目前僅有 `deviceUuid / ipAddress / testId / type / createdAt`，不足以判斷）：

- 該裝置原本綁定的學號與姓名
- 該學號目前是否在其他裝置上線
- 上一次斷線的時間
- 請求來源 IP 與名單上該學號的預設 IP 是否相符

**情境 A 的改綁必須一次解完兩邊。** 現況 `approveRequest` 的 `UNBIND_USER` 只解除 `request.testId`（該裝置原本綁的人），若新學號自己還綁在另一台機器上，登入時仍會撞 `BINDING_LOCKED`，需要跑第二次流程。核准介面必須讓助教直接指定「這台機器接下來給哪個學號」。

**被拒絕的註冊請求不得有副作用。** 現況在 throw 403 之前先寫入 `existing.status`，使得任何人送一個帶他人 `device_uuid` 的註冊請求，就能把一位正在考試的學生在助教畫面上降級為 `AWAITING_LOGIN` 並灌入待審佇列。`device_uuid` 在每個請求中均為明文，不是秘密。

---

## 7. 考卷的兩層加密

### 7.1 兩層的職責

| 層 | 金鑰 | 保護對象 | 防誰 |
|---|---|---|---|
| **傳輸層**（既有，不變） | 裝置 AES 金鑰 | 所有 API 請求與回應 | 網路上的旁觀者、冒用他機身分者 |
| **內容層**（新增） | `K_exam` | 題目敘述與所有測資 | **持有該台機器的學生**（在開考之前） |

裝置 AES 金鑰位於學生機器的 RAM，學生本就持有它，因此**它無法保護考卷不被該機器的使用者閱讀**。內容層必須是一把後端扣留到開考才釋出的獨立金鑰。

### 7.2 `config.meta` 與 `config.cipher` 的切分

切分原則：**只有環境檢查與入場流程真正需要的資料才進 meta。**

**`config.meta`（明文，`INITIALIZED` 起即可下發）**

```
testTitle            考試標題（顯示用）
description          考試說明（顯示用）
accessibleUsers[]    { id, name, ip }        自動登入與離線名單比對需要
judgerSettings       { timeLimit, memoryLimit, ... }   環境探針需要真實上限
sections[]           { id, title, maxScore, puzzles[] }
  puzzles[]          { id, language, timeLimit, memoryLimit }   ← 僅此四欄
wrappedExamKey       { salt, iv, ciphertext, tag }    見 §7.3
```

**`config.cipher`（密文，以 `K_exam` 加密）**

```
puzzles[]            { id, title, score, subtasks[], specialRules[] }
  subtasks[]         { title, score, visible[], hidden[] }      ← 所有測資
globalSpecialRules[]
```

**解密後合併**：客戶端取得 `K_exam` 後解密 `config.cipher`，依 `puzzle.id` 與 meta 合併還原成既有的 `ExamConfig` 結構。**下游程式碼（judger、UI、special rules）完全不需改動**，只有 config 的取得路徑改變。

**不進 meta 的項目與理由**：

- 題目標題、配分、subtask 結構 —— 會透露題目主題，讓學生在開考前準備方向
- 任何測資 —— 本規格的首要保護目標
- 特殊規則 —— 會透露解法限制

### 7.3 `K_exam` 的產生、包裝與取得

**產生**：後端在進入 `INITIALIZED` 時產生 256-bit 隨機金鑰，存入 `SystemSettings.exam_key`，並加入 `PROTECTED_SETTINGS_KEYS`。

**包裝**（用於離線取得）：

```
salt          = 隨機 16 bytes
derivedKey    = PBKDF2-HMAC-SHA256(startPassword, salt, iterations)
wrappedExamKey = AES-256-GCM(K_exam, derivedKey)
```

`wrappedExamKey` 與 `salt` 隨 `config.meta` 一併下發。

**`startPassword` 不再以明文下發。** 現況它位於 `config.environmentVariables.startPassword` 並隨完整 config 送到每台學生機器，再於 renderer 以明文比對 —— 等於把閘門的鑰匙發給被擋的人。改制後後端保留明文用於產生 `wrappedExamKey`，客戶端只收到 `wrappedExamKey`。

**兩條取得路徑，導出同一把 `K_exam`**：

| 路徑 | 條件 | 流程 |
|---|---|---|
| **A. 線上（自動）** | 後端可用 | 後端廣播「開考」信號 → 客戶端呼叫 `POST /user/exam/key`（以裝置 AES 金鑰加密的既有安全通道）→ 後端確認階段為 `IN_PROGRESS` 後回傳 `K_exam` |
| **B. 離線（人工）** | 隨時可用 | 監考現場宣讀口令 → 客戶端 PBKDF2 導出 → 解開 `wrappedExamKey` |

**`K_exam` 絕不透過 socket 明文廣播。** socket 廣播是對所有連線者發送，不具備收件人驗證。廣播只傳遞「開考」這個事實，金鑰一律走加密的點對點端點。

**路徑 B 是常備路徑，不是緊急開關。** 它必須隨時可用而不需要任何模式切換 —— 因為需要它的時刻，正是後端不可用、無法進行任何切換的時刻（P4）。

**冪等**：兩條路徑導出同一把金鑰，重複取得無副作用。因此不存在「哪個是權威」的問題，權威是金鑰本身。

### 7.4 考卷更新

考試期間更新 config 時，後端重新產生 `config.meta` 與 `config.cipher`，**`K_exam` 不變**（口令不變）。客戶端收到 `config_update` 廣播後重新取得兩者，以手上既有的 `K_exam` 解密。既有的「更新後全體重新評測」行為不變。

`exam-config.service.ts` 既有的「不得變更 hidden 測資數量」保護維持不變。

---

## 8. 線上與離線

### 8.1 模式判定

模式由**「是否曾經成功與後端完成裝置註冊」**決定，而不是由設定檔的來源決定。

| 情境 | 模式 |
|---|---|
| 曾成功註冊 | **線上模式** |
| 從未成功註冊，且由監考手動佈署考卷 | **離線模式** |

### 8.2 線上模式

- socket 無限重連（既有行為，維持）
- 斷線期間：本機作答、評測、計分全部照常；階段變更、訊息、分數同步暫停
- 復連後：自動同步佇列（log queue、待送分數、待送程式碼、回填登入）
- **斷線不改變模式。** 斷線只是線上模式的一個暫時狀態，不是切換到離線模式。

> **需修正**：現況 `connection.service.ts` 的 `pendingTestResult` / `pendingProgramFile` 重試是空的 —— 復連時只清掉旗標，寄望學生下次評測時順帶重送。若學生不再重跑，斷線期間的結果永久遺失。必須改為真正的重送佇列。

### 8.3 離線模式

- 整場保持離線，**不自動升級為線上**（依既定規則：一開始就沒連上且已手動進入下個階段，就一直保持離線）
- 不建立 socket、不輪詢
- 階段推進由監考人工進行
- 開考走路徑 B（口令解密）

### 8.4 學生不得自行進入離線模式

現況桌面版 Settings 頁在 router 中無條件放行，考試中已登入的學生仍可進入；該頁提供設定檔上傳，而上傳會將 `isOfflineMode` 設為 `true` 且無回頭路，使 socket 完全停止。**結果是學生可以用兩次點擊把自己從所有伺服器控制中移除**（不再收 force logout、不再收階段廣播、不再回報違規），而助教端只會看到「掉線」，與真實網路故障無從區分。

**規定**：

- 進入 `SETUP_FINISHED` 之後，桌面版 Settings 頁一律不可進入
- 離線佈署只能在 `SETUP_FINISHED` 之前、由監考在該台機器上執行

---

## 9. 後端不可用時的降級程序

### 9.1 `INITIALIZED` 之前後端即不可用

機器尚未取得考卷，必須由監考手動佈署。

**佈署檔的形式**：後端匯出的 `{ meta, cipher }` 檔案（與線上會下發的內容相同），而**不是明文 config**。理由是隨身碟遺失時測資仍受 `K_exam` 保護。開考時一樣由監考宣讀口令解密（路徑 B）。

> 這同時取代現況 `setConfigFromFile` 接受明文完整 config 的行為 —— 該行為既是測資外洩面，也是 §8.4 的攻擊入口。

### 9.2 `IN_PROGRESS` 期間後端不可用

| 狀況 | 結果 |
|---|---|
| 已在考試中的機器 | **完全不受影響**。考卷已解密於 RAM，judger 在本機執行 |
| 期間重啟的機器 | **無法救回**。密文與 `K_exam` 皆在 RAM，兩者都須向後端重新取得；口令只能解密文，無法生出密文 |
| 考試結束 | **由監考口頭宣布、逐台收卷**（已決策：不做本機倒數、不做斷線自動鎖卷） |

**已接受的後果**：後端不可用期間，學生端在系統層面沒有結束訊號，作答狀態會一直持續到監考逐台確認為止。

---

## 10. Schema 與型別修改

### 10.1 後端 `backend/src/schemas/config.schema.ts`

| 修改 | 內容 |
|---|---|
| 新增 | `examConfigMetaSchema` —— §7.2 的 meta 結構 |
| 新增 | `examConfigSecretSchema` —— §7.2 的密文明文結構（加密前的形狀） |
| 新增 | `wrappedExamKeySchema` —— `{ salt, iv, ciphertext, tag }` |
| 保留 | `examConfigSchema` —— 管理員上傳的完整考卷格式不變 |
| 變更 | `environmentVariables.startPassword` 維持必填，但**不再進入任何下發到客戶端的 payload** |

### 10.2 後端 `SystemSettings`

| Key | 說明 |
|---|---|
| `exam_key` | `K_exam`。加入 `PROTECTED_SETTINGS_KEYS` |
| `exam_config_cipher` | `config.cipher`。加入 `PROTECTED_SETTINGS_KEYS` |
| `exam_config_meta` | `config.meta`（含 `wrappedExamKey`） |
| `exam_state` | 值域改為五個新名稱 |

### 10.3 後端 `ExamState` enum

`backend/src/services/exam-state.service.ts`：值改為 `UNINITIALIZED / INITIALIZED / SETUP_FINISHED / IN_PROGRESS / FINISHED`，並新增轉移表驗證。

### 10.4 後端 `LoginRequest` model

| 修改 | 內容 |
|---|---|
| `type` | 由 `FIRST_TIME / SECONDARY` 擴充為可區分 §6.3 三種情境 |
| 新增欄位 | `previousTestId`（該裝置原本綁定的學號），供助教判斷 |

### 10.5 桌面版 `desktop/src/main/schemas/examConfig.schema.ts`

| 修改 | 內容 |
|---|---|
| 新增 | `examConfigMetaSchema`、`examConfigSecretSchema`、`wrappedExamKeySchema`（與後端同形） |
| 新增 | `mergeExamConfig(meta, secret): ExamConfig` —— 解密後合併還原既有結構 |
| 保留 | `examConfigSchema` —— 合併後的結果仍須通過它，下游不變 |

### 10.6 桌面版 `desktop/src/common/types.ts`

| 修改 | 內容 |
|---|---|
| `ExamState` | 改為五個新名稱 |
| `RamStoreState` | 新增 `examConfigMeta`、`examConfigCipher`、`examKey`；`isOfflineMode` 語意改為 §8.1 的判定 |

### 10.7 API 變更

| 端點 | 變更 |
|---|---|
| `POST /user/exam/config` | 驗證由「session token」放寬為「已註冊裝置」；回傳 `{ meta, cipher }`。放寬不擴大風險，因為 cipher 沒有 `K_exam` 無法解讀 |
| `POST /user/exam/key` | **新增**。以裝置 AES 金鑰加密的通道取得 `K_exam`。僅在 `IN_PROGRESS` 回傳 |
| `POST /admin/exam-state` | 加入轉移表驗證 |
| `POST /admin/init/reset` | 廣播改用獨立的 reset 事件型別 |
| `GET /admin/connection/requests` | 回傳 §6.3 所列的判斷資訊 |
| `POST /admin/connection/requests/:id/approve` | 支援指定「這台機器接下來給哪個學號」，一次解完兩邊綁定 |
| `POST /admin/device/:uuid/re-entry` | **新增**。助教觸發單一裝置重來 |
| 全部 `/user/*` | 依 §4 的階段矩陣加入階段檢查。目前除壓測服務外，無任何業務邏輯檢查階段 |

### 10.8 桌面版路由守衛

依 §6.1 改為推導式；`SETUP_FINISHED` 之後禁止進入 Settings 頁（§8.4）。

---

## 11. 與現況的差異清單

| # | 項目 | 現況 | 本規格 |
|---|---|---|---|
| 1 | 階段數 | 4 個，`NOT_STARTED` 身兼二職 | 5 個，語意各自獨立 |
| 2 | 階段轉移 | 任意兩狀態可跳 | 單向查表，僅 reset 可退 |
| 3 | 註冊關閉時機 | 進入 `IN_PROGRESS` 才關 | 進入 `SETUP_FINISHED` 即關 |
| 4 | 註冊觸發 | 由登入流程懶觸發 | `INITIALIZED` 的獨立步驟 |
| 5 | 考卷下發 | 登入成功即下發完整明文 | meta 早發、密文早發、`K_exam` 開考才發 |
| 6 | `startPassword` | 明文下發、renderer 比對 | 不下發，升格為 `K_exam` 包裝金鑰 |
| 7 | 開考權威 | 後端廣播與口令兩套並存且語意不明 | 同一把金鑰的兩條取得路徑 |
| 8 | reset 客戶端行為 | 僅改 `examStatus` | 完整清除（§5.2 清單） |
| 9 | 重啟後重新登入 | 一律判為二次綁定，403 死路且離線 fallback 不可達 | 走重來路徑，經助教核准後回到考試 |
| 10 | 助教核准資訊 | 五個欄位，無法區分三情境 | 補齊判斷資訊與情境分類 |
| 11 | 被拒註冊的副作用 | 先寫入 status 再 throw | 無副作用 |
| 12 | 環境檢查結果 | 只存在桌面版 RAM | 上報後端，構成準備狀況頁 |
| 13 | 階段權限檢查 | 僅壓測服務有 | 全 `/user/*` 依矩陣檢查 |
| 14 | Settings 頁 | 考試中仍可進入並自行離線 | `SETUP_FINISHED` 後鎖定 |
| 15 | 離線模式 | 由設定檔來源決定且不可逆 | 由註冊是否成功決定 |
| 16 | 離線佈署檔 | 明文完整 config | `{ meta, cipher }`，口令解密 |
| 17 | 斷線重送 | 空實作 | 真正的重送佇列 |
| 18 | 收卷緩衝 | 僅前端常數，後端不檢查 | 後端執行，單一設定來源 |

---

## 12. 已知限制與已接受的風險

| # | 事項 | 說明 | 決策 |
|---|---|---|---|
| R1 | 短口令可離線暴力破解 | `wrappedExamKey` 在學生機器上，口令短則可在開考前的空檔破解取得測資。攻擊窗口為學生就座到開考之間，且需在監考視線內執行 | **接受**（校內考試，採簡短口令） |
| R2 | 未提交的程式碼會遺失 | 本機檔案位於每次啟動重建的暫存目錄，重來或換機後只能復原已提交的版本 | **接受**（後端有題目自動下載與恢復功能，並有一定程度的備份） |
| R3 | 後端不可用期間重啟的機器無法救回 | 密文與 `K_exam` 皆為 RAM-only；口令無法生出密文 | **接受**（RAM-only 設計的固有代價） |
| R4 | 後端不可用時無系統層級的結束訊號 | 不做本機倒數，結束改為人工逐台收卷 | **接受** |
| R5 | 全班同時重啟會壅塞助教佇列 | 停電、網路設備重啟、後端重啟都會使全班同時進入待審 | **本次不處理**，另案 |

---

## 13. 本規格不涵蓋

以下項目在討論中提出但明確排除於本次範圍：

- **驗證題（canary）** —— 環境檢查維持現有的合成探針
- **考試時長與本機倒數** —— 不納入 `config.meta`
- **助教佇列的規模問題** —— 自動放行規則、批次核准、事件聚合（R5）
- **身分驗證的密碼學缺陷** —— session token 以客戶端自有金鑰簽章，可自簽任意 `testId`；修正方式為在 `user-crypto.middleware.ts` 比對 `tokenPayload.testId === DeviceKeyMap.testId`。**與本規格獨立，但建議優先處理**
- **分數由客戶端自報** —— 建議以「後端複判為準 + 差異報表」的流程處理
- **管理端憑證、`LOAD_TEST_MODE`、時鐘偏移、`trust proxy`** 等既有設定問題

---

## 14. 待審定事項

1. §4.5 收卷緩衝 `T_buffer` 的實際值，以及後端與桌面版的單一設定來源放在哪裡
2. §7.3 PBKDF2 迭代次數（需在「簡單加密」與離線破解成本之間取值）
3. §10.4 `LoginRequest.type` 的三種情境命名
4. §12 R1 是否需要為口令設下限長度（目前規格不設限）
