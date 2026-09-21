# Phase 0 Research: Post-Deployment Rehearsal

**Feature**: 008-post-deploy-rehearsal ｜ **Date**: 2026-09-21

Technical Context 中沒有留下 NEEDS CLARIFICATION。本檔記錄七項決策，以及一項**在調查過程中發現的既有設計衝突**（D4）—— 那一項若不先解決，演練走到評測段會必然卡死。

---

## D1. 演練如何抵達 API：loopback HTTP，不是 service 呼叫

**Decision**：演練的每一步都以 Node 內建 `fetch` 對 `http://127.0.0.1:${PORT}` 發出真實 HTTP 請求；學生步驟打 `/user/**`，助教步驟打 `/admin/**` 並帶 `ADMIN_TOKEN`。

**Rationale**：本功能要驗證的東西幾乎全部**只存在於 HTTP 層**，service 呼叫看不到：

| 只在 HTTP 層的檢查 | 位置 |
|---|---|
| 階段權限矩陣（FR-006、FR-008 的整個依據） | `middlewares/exam-phase.middleware.ts` |
| AES-GCM 解密、session token 驗證、replay 防護 | `middlewares/user-crypto.middleware.ts` |
| 管理權限 | `middlewares/admin.middleware.ts` |
| 評測的 202-accept 與 job handle 交接 | `AdminJudgerController.accept` |
| JSON 序列化與反序列化的往返 | Express 邊界 |

experience.md 教訓 #5 已經為這個選擇付過學費：`require()` 的 ESM 地雷**只有在整合測試以不同的模組載入方式跑同一段程式碼時才現形**。同一個道理，接縫只有在真的走過去的時候才會露出來。

**Alternatives considered**：
- *直接呼叫 service* —— 被 FR-007 明文否決。它證明資料庫可寫，不證明考試可辦；而且會漏掉上表每一列。
- *supertest 注入 app* —— supertest 是 devDependency，不該進 production runtime；且它繞過真實的 socket/port，無法暴露「服務有沒有真的在聽」這類部署問題，而那正是部署後測試的主場。

**Consequences**：`rehearsal.service` 必須以依賴注入持有這個 `fetch`（`Dependencies.http`），單元測試才能在沒有 server 的情況下跑段落邏輯；整合測試則對真實 app 跑全程。

---

## D2. 模擬學生的加密握手：用 node:crypto 重做一次真實桌面版的流程

**Decision**：`rehearsal-client.ts` 實作與桌面版等價的握手：

1. `GET /user/auth/rsa-public-key`
2. 本機產生 32-byte AES-256 金鑰
3. 以 RSA-OAEP / SHA-256 加密該金鑰 → `POST /user/auth/register-device`
4. 登入：把 `{ testId }` 以 AES-GCM 包起來 → `POST /user/auth/login` → 取得 `session_token`
5. 其後每個受保護請求的 body 為 `{ device_uuid, iv, ciphertext, tag }`，明文含 `session_token`、`timestamp`、`nonce`

**Rationale**：這正是 `CryptoService` 與 `decryptAndVerifyDeviceSession` 期望的形狀。參數（`RSA_PKCS1_OAEP_PADDING` + `oaepHash: "sha256"`、`aes-256-gcm`、HMAC-SHA256 session token）全部可從 `services/crypto.service.ts` 直接讀出，沒有猜測空間。

**明確否決 `LOAD_TEST_MODE`**：把它設成 `pure` 會讓 `CryptoService` 與中介層整段短路（`decryptAESGCM` 直接 base64 解碼、session token 不驗 MAC、IP 可由 header 偽造）。那會把演練變成對一條**考試當天不存在的程式路徑**的測試 —— 正是 experience.md 教訓 #4 說的「綠燈不等於有效」。演練必須在 `LOAD_TEST_MODE` 未設定的情況下通過。

**Alternatives considered**：*重用桌面版的 client 程式碼* —— 它在另一個 repo（`ntut-exam-v2/desktop`），跨 repo 相依會讓 host 的測試被 desktop 的版本綁住，代價遠大於重寫這 40 行握手。

---

## D3. 模擬學生如何通過防作弊：讓名單項不帶 IP，而不是開後門

**Decision**：演練考卷的 `accessibleUsers` 項目**不設 `ip` 欄位**。

**Rationale**：`AuthService.loginAndBind` 的 IP 比對有一個天然的短路：

```
if (user.ipAddress) { ...比對，不符則 IP_MISMATCH... }
```

`InitService.performInitialization` 以 `accessibleUser.ip || null` 建立 User。名單不給 IP → `user.ipAddress` 為 `null` → 整段比對跳過。演練的請求來自 `127.0.0.1`，不需要任何特例。

這是本功能最重要的一條「不要為測試改 production」的線：**演練通過防作弊的方式，必須是防作弊本來就允許的方式**。任何「若為演練則略過檢查」的分支都會在 production 程式碼裡留下一個以布林值控制的旁路，而那個布林值遲早會被別的東西設成 true。

**Alternatives considered**：
- *在名單填 `127.0.0.1`* —— 也能動，但會讓演練依賴「後端與演練同機」這件事；容器化部署下 `req.ip` 未必是 `127.0.0.1`（可能是 bridge 網段）。不設 IP 對來源完全不敏感，更穩。
- *開 `LOAD_TEST_MODE` 的 IP mock header* —— 見 D2，否決。

---

## D4. ⚠ 發現的設計衝突：演練若拿 deploy lease，會自己卡死自己

**問題**：`JudgingWorkCoordinator` 目前只有兩種 lease。

```
acquireDeploy()  → 若 students > 0 則拒絕；成功後設 deploy = true
acquireStudent() → 若 deploy || draining 則回 null
```

而 `JudgeQueueService.start()`（助教手動評測的唯一入口）第一件事就是 `acquireStudent()`，拿不到就丟 `JudgingWorkConflictError`，控制器回 409。

於是：演練為了排除 feature 006 的部署測試而拿 deploy lease → 走到評測段 → `acquireStudent()` 回 `null` → **演練必然在自己最重要的那一段失敗**。這不是實作瑕疵，是既有互斥模型裡沒有「演練」這個角色。

**Decision**：`JudgingWorkCoordinator` 新增第三種狀態 `rehearsal`：

| 呼叫 | 目前 | 新增後 |
|---|---|---|
| `acquireRehearsal()` | — | `deploy`／`draining`／`students > 0` 任一成立則拒絕；否則設 `rehearsal = true` |
| `acquireDeploy()` | 檢查 `deploy`／`draining`／`students` | **再加上**：`rehearsal` 為真則拒絕（`reason: "rehearsal_active"`） |
| `acquireStudent()` | `deploy \|\| draining` 則 null | **不變** —— `rehearsal` 不擋學生評測 |

**為什麼 `acquireStudent()` 刻意不擋**：演練期間**不可能存在真實學生的評測**。要有真實學生評測，得先有真實學生（`User` 資料列）；而演練的啟動前置條件已經要求 `User.count() === 0`，且演練進行中階段由演練自己推進、真實裝置無從登入。因此此時唯一會呼叫 `acquireStudent()` 的就是演練自己觸發的那一次。讓它通過，演練才能走完助教真正走的那條路。

**Alternatives considered**：
- *演練不拿任何 lease* —— 部署測試可在演練中途插入，兩者共用評測引擎互相污染（spec.md Edge Cases 明文要求拒絕其一）。
- *演練評測繞過 `JudgeQueueService`* —— 那就不是助教走的路，US3 失去全部意義；而且會重複 controller 的編排邏輯，日後靜默漂移（教訓 #4 的形狀）。

---

## D5. 報告如何在清除後倖存

**Decision**：報告寫入 `SystemSettings` 資料表，key 為 `post_deploy_rehearsal_latest`，只保留最近一次（`upsert` 覆寫），與 `DeployTestRepository` 完全同形。

**Rationale**：`InitService.wipeAllData()` 只 `destroy` 考試相關資料表，對 `SystemSettings` 僅 `purgeSetting` 三個具名 key（`exam_key`／`exam_config_meta`／`exam_config_cipher`）。因此存在 `SystemSettings` 的報告天然倖存於全域 reset —— **不需要為 FR-019 修改 reset 的任何行為**，這正是想要的：reset 是本功能依賴的既有機制，改它會讓改動外溢到考試主線。

**Alternatives considered**：*新增 `rehearsal_reports` 資料表* —— 需要 migration，且會冒著被未來某次 wipe 順手清掉的風險；只留最近一次已滿足 FR-019 與 SC-006。

---

## D6. 重啟後的收斂：標記中斷**並且**完成清除

**Decision**：`RehearsalStartupService.run()` 在 `index.ts` 啟動序列中，緊接 `DeployTestStartupService.run()` 之後執行。若持久化的 run 非終態，則：標記 `interrupted / process_restart` → **執行清除**（`InitService.wipeAllData()`）→ 標記 `cleanupCompleted`。

**為什麼敢在開機時做破壞性動作**：因為 run 紀錄本身就是「這些資料屬於演練」的證明。關鍵在**寫入順序**：run 紀錄（含 `ownsSystemState: true`）必須在**第一次變更系統之前**落地。因此任何「系統非 UNINITIALIZED 而且存在非終態 run 紀錄」的狀態，其資料只可能來自演練 —— 真實考卷不可能在演練啟動之後被上傳（US5 的前置條件與階段閘門雙重擋住）。

若清除失敗，紀錄保持 `cleanupCompleted: false`，管理端顯示 FR-015 的警示，且**後續的演練啟動一律拒絕**直到助教手動處理。失敗不會被開機流程吃掉。

**Alternatives considered**：*只標記中斷、不清除*（feature 006 的做法）—— 006 的部署測試不變更考試資料，中斷無殘留；本功能會留下半場考試的資料，停在 `SETUP_FINISHED` 的系統會讓助教以為考試已經開始準備。FR-016 與 US4 場景 5 明確要求清除。

---

## D7. 演練考卷的形狀：一位學生、兩道題、可預期的 AC 與 WA

**Decision**：`rehearsal-paper.config.ts` 匯出一份以 `ExamConfig` 標註、並在模組載入時 `examConfigSchema.parse()` 的常數：

- `accessibleUsers`：1 位，`{ id: "__rehearsal__", name: "Rehearsal Student" }`，無 `ip`（見 D3）
- `sections`：1 節，2 道 C 語言題
  - `rehearsal-ac`：讀兩數輸出其和；演練提交**正確**程式 → 預期 AC、滿分
  - `rehearsal-wa`：同題面；演練提交**刻意算錯**的程式 → 預期 WA、0 分、歸因為學生
- `environmentVariables.startPassword`：非空（schema 強制，見 experience.md #3）
- `judgerSettings`：小而明確的 timeLimit／memoryLimit；**不覆寫 `maxConcurrentJobs`** —— 那是機器屬性，演練沒有資格替它決定

**為什麼一定要有一份 WA**：只驗證成功路徑的演練，會漏掉 experience.md #6 那整類問題 —— 系統把自己的失敗記在學生帳上。FR-011 要求演練在判定歸因為 SYSTEM 時失敗，而那個判定只有在「本來就該失敗的提交」上才有意義。

**型別綁定是硬要求**：常數以 `ExamConfig` 標註，`tsconfig.test.json` 已把 `test/**` 納入 strict 檢查，`src/**` 本來就在。考卷 schema 一旦演進，這份 fixture 會**編譯失敗**而不是靜默脫鉤 —— experience.md #4 花了兩個月學到的那一課。

---

## D8. 段落切分與逾時

**Decision**：六個段落，逐段獨立逾時，另有整場 deadline（預設 5 分鐘，對應 SC-001）：

| # | 段落 | 內容 | 預設上限 |
|---|---|---|---|
| 1 | `paper` | 上傳演練考卷 → 初始化 → 進入 `INITIALIZED` | 15s |
| 2 | `enrol` | 模擬裝置註冊、取 meta+cipher、回報環境檢查；**並驗證此時索取金鑰被 409 拒絕**（FR-008） | 20s |
| 3 | `admit` | 推進 `SETUP_FINISHED` → 模擬學生登入 | 15s |
| 4 | `submit` | 推進 `IN_PROGRESS` → 取 `K_exam` → 解密 cipher → 送出兩份程式碼 | 20s |
| 5 | `grade` | 觸發助教手動評測 → 輪詢 job handle → 比對兩份的判定與分數 | 180s |
| 6 | `cleanup` | 全域 reset，驗證系統回到 `UNINITIALIZED` 且資料歸零 | 30s |

**Rationale**：切分點對應 spec.md 所說的四個接縫，加上前後的初始化與清除。`grade` 的上限遠大於其他段落，因為它是唯一要等編譯與執行的一段（experience.md #6：`compile_timeout` 落回套件硬編的 10s 曾是事故引信；這裡 180s 給了重試與排隊的餘裕）。

**逾時的處理不對稱**：段落 1–5 任一逾時 → 該段失敗、**停止推進**、但仍執行段落 6。段落 6 逾時 → FR-015 的警示路徑。清除永遠會被嘗試，這是 US4 場景 2 的要求。

---

## 尚未決定、留給實作的細項

以下不影響架構，實作時就地決定即可：

- 逐段進度的推送方式：沿用 feature 006 的輪詢（`GET /admin/rehearsal/latest`）即可；既有 admin socket 也可用，但輪詢已足夠且少一個失敗點。
- 演練學號的字面值：需與真實學號不可能相撞，`__rehearsal__` 之類的形狀即可。
- 報告中截斷的長度上限：沿用 `utils/judger-output.util.ts` 的 `truncateJudgerOutput`，不另立標準（FR-020）。
