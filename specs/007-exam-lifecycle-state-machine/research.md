# Phase 0 Research: Exam Lifecycle State Machine and Paper Encryption

**Feature**: `007-exam-lifecycle-state-machine`　**Date**: 2026-09-04

本檔解決 `spec.md` 與 `checklists/requirements.md` 中標記為待確認的項目，以及實作前必須先定案的技術選擇。每項採「決策 / 理由 / 已排除的替代方案」格式。

---

## R1. 收卷緩衝期的長度與設定來源

**決策**：緩衝期固定為 **60 秒**，來源為後端 `judgerSettings` 之外的新設定鍵 `exam_submit_grace_seconds`，隨 `config.meta` 下發至桌面版。後端與桌面版皆以此值為準。

**理由**：
- 現況桌面版 `renderer/constants/bufferState.ts` 的 `startBuffer(seconds = 60)` 已預設 60 秒，沿用可避免行為變動。
- 現況該值**只存在於桌面版**，後端完全不檢查，因此「緩衝結束後拒絕提交」目前無人執行。把它放進 `config.meta` 讓兩端讀同一個值，是最小的單一來源做法。
- 放在 meta 而非 cipher，因為後端必須在不解密的情況下用它判斷是否接受提交。

**已排除**：
- *放進 `judgerSettings`*：該物件的語意是評測資源上限，加入收卷時間會混淆職責。
- *後端硬編、桌面版硬編兩份*：正是目前脫鉤的成因。
- *設為 0（結束即拒絕）*：正在上傳中的請求會失敗，且無法區分「作弊補交」與「網路延遲」。

---

## R2. 監考口令的金鑰導出參數

**決策**：`PBKDF2-HMAC-SHA256`，**600,000 次迭代**，salt 16 bytes 隨機，輸出 32 bytes。包裝採 `AES-256-GCM`。

**理由**：
- 兩端皆為 Node 環境（後端 Node ≥ 20.19，桌面版 Electron 31 主行程），`crypto.pbkdf2` 為內建，不引入新依賴。這符合「簡單加密」的決策。
- 600,000 次為 OWASP 對 PBKDF2-HMAC-SHA256 的現行建議值。在考試機器等級的硬體上導出一次約需數百毫秒 —— 對「開考時輸入一次口令」是可忽略的成本。
- 使用者已決定採**簡短口令**，因此口令本身的熵偏低。迭代次數是此設計中唯一能提高離線破解成本的槓桿，應取足夠高的值。這不會消除 R1 風險，只是把單次嘗試的成本從微秒提高到百毫秒級。

**已排除**：
- *scrypt / Argon2*：抗硬體平行化更佳，但 Argon2 需引入原生依賴，與「簡單」的決策相悖；scrypt 雖為 Node 內建，但參數調校較 PBKDF2 複雜，且其記憶體成本在考試機器上可能影響同時進行的評測。
- *直接 SHA-256(口令)*：無迭代成本，簡短口令將可在極短時間內窮舉。
- *更低的迭代次數（如 10 萬）*：在口令已刻意簡短的前提下，沒有理由再放寬唯一的成本槓桿。

---

## R3. 入場申請三種情境的命名

**決策**：`LoginRequest.type` 由現行的 `FIRST_TIME | SECONDARY` 改為三值：

| 值 | 對應情境 | 判別條件 |
|---|---|---|
| `NEW_DEVICE` | 全新機器 | `DeviceKeyMap` 不存在 |
| `REBIND` | 已綁定學生的機器重新入場 | `DeviceKeyMap` 存在且 `testId != null` |
| `UNBOUND_DEVICE` | 已註冊但未綁定學生的機器 | `DeviceKeyMap` 存在且 `testId == null` |

同時新增 `previousTestId` 欄位，於 `REBIND` 時記錄該裝置原本綁定的學號。

**理由**：
- 現行的 `SECONDARY` 同時涵蓋 `REBIND` 與 `UNBOUND_DEVICE`，助教無從區分 —— 而這兩者的適當處置完全不同（前者可能需要解綁，後者只是核准或拒絕）。
- 命名以「裝置的狀態」而非「事件的次序」描述，因為助教實際要判斷的是眼前這台機器的狀況，不是它是第幾次申請。
- `FIRST_TIME` → `NEW_DEVICE` 為求與另外兩者的命名軸一致。

**已排除**：
- *保留兩值、以額外欄位區分*：助教介面仍需自行組合條件，且分類邏輯會散落在前端。
- *以「重啟 / 換機 / 新機」命名*：這是**成因**，而後端無法可靠地區分重啟與換機（兩者送出的請求形狀相同）。以可觀察的裝置狀態命名才是可實作的。

---

## R4. 監考口令是否設長度下限

**決策**：**不設下限**，但後端在產生 `wrappedExamKey` 時，若口令長度少於 6 個字元，於管理端顯示明確警告並要求二次確認。警告文字須說明其後果（考卷在開考前的保護強度等同於此口令）。

**理由**：
- 使用者已明確決定採用簡短口令，並在 `spec.md` 的 Assumptions 中接受該風險。強制下限會違背既有決策。
- 但「已接受風險」與「不知情地承擔風險」不同。產生金鑰的時刻是唯一能讓管理員知情的時刻，成本極低。
- 二次確認而非硬性阻擋，保留了管理員的最終決定權。

**已排除**：
- *強制最少 8 碼*：與已下的決策相悖。
- *完全不提示*：管理員可能不知道 `startPassword` 的職責已從「UI 閘門」變更為「解密金鑰」—— 這是本功能引入的語意改變，必須主動告知。

---

## R5. 跨端的 schema 對齊方式

**決策**：於**三處** schema 定義各放置一份**逐位元組相同**的契約 fixture，並各自撰寫測試驗證其能通過該端的定義：

```
host/backend/test/fixtures/exam-config-payload.fixture.json     # zod ^3
desktop/test/fixtures/exam-config-payload.fixture.json          # zod ^4
host/frontend/test/fixtures/exam-config-payload.fixture.json    # TypeScript type
```

config schema 有三份定義而非兩份 —— 除了後端與學生端的 zod，管理端另有 `host/frontend/src/types/config.ts` 供設定編輯器使用。

fixture 內容涵蓋 `config.meta`、`config.cipher` 封包與 `wrappedExamKey` 三種結構的完整樣本。任一端修改 schema 而未同步更新 fixture，另一端的測試即失敗。

**理由**：
- 兩個 repo 無法共用程式碼（獨立版控、獨立套件管理），因此不存在真正的單一來源。
- `knowledge/experience.md` 第 4 條記載過同類事故：fixture 與 production schema 脫鉤，紅燈持續約兩個月無人察覺。其教訓是「fixture 必須型別綁定到 production schema 且只有單一來源」。跨 repo 的最佳近似，就是讓 fixture 內容成為三端共同的錨點。
- **同一個缺口已經咬過一次**：`host/frontend/src/types/config.ts` 內留有註解，記錄 feature 004 新增 `judgerSettings` 欄位後，該型別描述了舊 schema 一段時間而無人察覺，且當時明確記為「a finding, not attempted here」。本次一併補上。
- 管理端是 TypeScript type 而非 runtime schema，因此其驗證為型別層斷言（fixture 可指派為 `ExamConfig`），而非 parse。
- **關鍵細節**：兩端的 zod 主版本不同（後端 `^3.23.8`、桌面版 `^4.3.5`）。同一份 schema 定義在兩個主版本間的行為並非完全一致（尤其是預設值填充與 `catchall` 的處理）。fixture 驗證正是為了讓這類差異在測試時就暴露，而非在考試現場。

**已排除**：
- *抽出共用 npm 套件*：`special-rule-engine` 已經是這種形式（git 依賴），可行但需維護第三個發布流程；對兩個結構的契約而言成本過高。
- *以 JSON Schema 為單一來源、兩端各自產生 zod*：引入產生步驟與新工具，違反「簡單」原則。
- *僅靠人工同步*：正是既有事故的成因。

---

## R6. 考卷內容加密的演算法與封包形狀

**決策**：`AES-256-GCM`，每次加密使用新的 12-byte IV。密文封包形狀與現行 `AesEncryptedPayload` 一致（`{ iv, ciphertext, tag }`，Base64 編碼），以重用兩端既有的加解密程式碼。

**理由**：
- 兩端皆已實作 AES-256-GCM（後端 `CryptoService.encryptAESGCM/decryptAESGCM`，桌面版 `cryptoService.encryptAesPayload/decryptAesPayload`），且封包形狀相同。內容層沿用同一形狀可避免新增第二套加解密路徑。
- GCM 提供認證加密，可偵測密文遭竄改 —— 對「考卷內容」這種若被替換將直接影響評分公平的資料是必要的。
- 12-byte IV 為 GCM 標準，兩端現行程式碼已如此使用。

**已排除**：
- *AES-256-CBC + HMAC*：需自行組合認證，容易實作錯誤，且兩端都沒有現成程式碼。
- *以裝置金鑰再包一層*：傳輸層已提供此保護（`spec.md` FR-020 的兩層職責劃分），重複包裝只增加複雜度而不增加安全性。

---

## R7. 階段權限矩陣的強制點

**決策**：新增 `backend/src/middlewares/exam-phase.middleware.ts`，以一張宣告式的路由對階段對照表實作，掛載於 `/user` 路由樹的根部（`routes/user/index.ts`），位於 `loadTestIpMockMiddleware` 之後、各子路由之前。

**理由**：
- 現況這些規則散落於桌面版路由守衛、`device.service`、`auth.service`、`deploy-test.service` 四處，而全後端**只有壓測服務真正檢查階段**。集中為一張表是本功能可測性的前提（`spec.md` SC-006 要求逐項驗證）。
- 掛在路由樹根部而非各控制器，確保新增端點時「預設為拒絕」而非「預設為允許」—— 忘記加檢查會導致端點被擋，而不是靜默地開放。
- 桌面版的路由守衛仍需存在，但其職責降級為**使用者體驗**（不顯示不可用的畫面），權限的實際強制一律在後端。這符合 `spec.md` FR-004。

**已排除**：
- *在各服務內檢查*：即現況，已證實會漏。
- *僅在桌面版限制*：客戶端限制不是安全邊界，且離線佈署的機器可繞過。

---

## R8. reset 事件與一般階段廣播的區分方式

**決策**：reset 使用獨立的 socket 事件 `exam-reset`（而非沿用 `exam-message` 加 `namespace` 欄位），payload 僅含時間戳與原因。桌面版對此事件執行完整清除程序。

**理由**：
- 現況兩者共用 `exam-message` 事件並以 `namespace: "STATUS"` 區分，而桌面版收到後只更新階段字串。要在同一條路徑上加入「有時要清除全部狀態」的分支，等於在訊息處理中夾帶破壞性操作 —— 容易在後續修改中被誤觸發。
- 獨立事件讓「這是破壞性操作」在型別與程式碼結構上都顯而易見。
- reset 不寫入 `Message` 資料表。現況階段轉移會產生訊息紀錄，但 reset 的第一個動作就是清空該表，寫入後立即被清除是無意義的。

**已排除**：
- *沿用同一事件加旗標*：見上。
- *不廣播、靠輪詢發現*：桌面版最長需 60 秒才會察覺，期間仍以失效金鑰持續請求並累積 401。

---

## R9. 環境檢查結果的上報通道

**決策**：新增 `POST /user/exam/environment-report`，走既有的 `decryptAndVerifyDeviceSession` 加密通道之外的**僅需裝置註冊**驗證（與考卷下發相同），因為此時尚未登入。payload 僅含檢查狀態與失敗語言清單，不含任何診斷輸出。

**理由**：
- 環境檢查發生在 `INITIALIZED` 階段，此時**尚未登入**，因此不能要求 session token。
- 上報內容刻意精簡：助教需要的是「這台機器能不能用」，不是完整診斷。完整報告留在桌面版本機，需要時由現場人員查看。這同時避免了把可能很長的編譯器輸出送進資料庫（`knowledge/experience.md` 第 1 條的教訓：不受信任的外部輸出必須截斷）。
- 存於 `DeviceKeyMap` 的新欄位而非獨立資料表 —— 它是裝置的屬性，且每台裝置只保留最新一次結果。

**已排除**：
- *沿用 `POST /user/log`*：該端點需要 `testId`，登入前不可用。
- *上報完整報告*：資料量大、含未截斷的工具輸出、且助教介面用不到。

---

## R10. 桌面版考卷狀態的記憶體結構

**決策**：`ramStore` 新增三個欄位，並保留既有的 `examConfig` 作為**合併後**的結果：

| 欄位 | 內容 | 生命週期 |
|---|---|---|
| `examConfigMeta` | 明文 meta | 取得後至 reset／重來 |
| `examConfigCipher` | 未解密的密文封包 | 取得後至 reset／重來 |
| `examKey` | `K_exam` | 開考後取得，至 reset／重來 |
| `examConfig`（既有） | 解密合併後的完整考卷 | **開考後才有值** |

**理由**：
- 下游程式碼（judger、UI、special rules）一律只讀 `examConfig`。開考前該欄位為 `null`，天然地讓「開考前無法評測」成為結構上的事實，而非額外的檢查。
- 三個新欄位皆為 RAM-only，與既有的 `cryptoState` 一致，符合「金鑰不落地」的既有設計。
- `spec.md` SC-009 要求下游 0 處修改 —— 保留 `examConfig` 的形狀與語意是達成該指標的方式。

**已排除**：
- *以 `examConfig` 直接存放 meta，開考後再補上密文內容*：開考前 `examConfig` 會是一個結構不完整的物件，下游的既有假設（每題都有 subtasks）將被破壞。
- *解密後不保留 `examKey`*：考卷更新時需要重新解密，屆時將無金鑰可用（`design.md` §7.4）。

---

## R11. 離線佈署檔的格式

**決策**：單一 JSON 檔，含 `{ meta, cipher }` 兩個頂層鍵，由管理端匯出。桌面版載入路徑取代現行的 `setConfigFromFile`（明文完整考卷）。

**理由**：
- 與線上下發的 payload 形狀完全相同，因此桌面版只有「來源」不同，處理邏輯共用 —— 不需要為離線佈署維護第二套解析。
- 隨身碟遺失時測資仍受 `K_exam` 保護。現行的明文考卷上傳是既有的測資外洩面。
- 移除明文上傳同時關閉了「學生自行進入離線模式」的路徑（`design.md` §8.4）。

**已排除**：
- *保留明文上傳作為最後手段*：它是一個無法與正常操作區分的旁路，且沒有任何情境需要它 —— 匯出檔在後端可用時即可產生，後端不可用時明文考卷同樣拿不到。

---

## 未解決事項

無。`spec.md` 中不存在 `[NEEDS CLARIFICATION]` 標記，`checklists/requirements.md` 列出的四項待確認（R1–R4）已於本檔決策完畢。

## 對 Phase 1 的輸入

| 決策 | 影響的 Phase 1 產出 |
|---|---|
| R1、R6、R10 | `data-model.md` 的考卷相關實體 |
| R2 | `contracts/` 的金鑰取得契約 |
| R3 | `data-model.md` 的入場申請實體 |
| R5 | `quickstart.md` 的契約驗證步驟 |
| R7、R8、R9 | `contracts/` 的端點與事件定義 |
| R11 | `contracts/` 的離線佈署檔格式 |
