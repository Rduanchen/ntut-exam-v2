# Contract: Exam Languages and Advisory Environment Precheck

**Date**: 2026-10-14 · **Requirements**: FR-044–049 / SC-015–017

本契約補充 [exam-phase-api.md](exam-phase-api.md)。對本次語言檢查、登入限制及語言更新時機，以本檔為準；原考卷與金鑰端點不變。

## 1. POST /user/exam/languages（新增）

| 階段 | 可呼叫 |
|---|---|
| UNINITIALIZED | 否，409 phase_not_allowed |
| INITIALIZED | 是，需已註冊裝置 |
| SETUP_FINISHED | 是，需已註冊裝置（含助教核准後） |
| IN_PROGRESS | 是，供重新入場 |
| FINISHED | 否，409 phase_not_allowed |

外層沿用 AesEncryptedPayload：`{ device_uuid, iv, ciphertext, tag }`。以該已註冊裝置的 AES-256-GCM key 解密；不得只檢查 UUID 是否存在，不需學生 session_token。新端點任何執行模式皆不得免除裝置驗證。

解密請求：`{ timestamp: number, nonce: string }`。timestamp 為有限的 epoch 毫秒，nonce 為非空字串；沿用既有 10 秒時間差與 nonce 重放保護。封包及 JSON 必須在邊界驗證，禁止 any 向下游流動。重試使用新的 timestamp/nonce。

200 回應同樣以裝置 key 包成 AesEncryptedPayload；解密內容範例：

```json
{ "languages": ["C", "Cpp", "Python"] }
```

語言值精確區分大小寫，完整集合為 C、Cpp、Python、JavaScript、Java。由目前考卷所有題目去重並依上述順序輸出。只包含 languages；不附任何題目資料、名單、runtime 全目錄、資源限制、密文考卷、口令或金鑰。無語言的有效設定回 []，缺少設定不得回 []。

### 錯誤契約

沿用後端 HttpError 的 `{ error: 人類可讀訊息, code: 穩定錯誤碼 }`。新端點的分類固定如下；既有 phase middleware 的回應例外仍為 `{ error: "phase_not_allowed", phase }`。

| HTTP | code | 條件 |
|---|---|---|
| 400 | invalid_language_request | 封包格式、GCM 驗證、解密 JSON 或 timestamp/nonce 型別不合法 |
| 401 | device_not_registered | 找不到有效裝置註冊金鑰 |
| 401 | invalid_request_freshness | timestamp 過期或 nonce 重放 |
| 409 | exam_languages_unavailable | 考卷尚未可用或取得期間已被 reset |
| 500 | invalid_exam_languages | 已儲存設定不符合 schema／含不支援語言；僅回一般訊息，詳細資料不外洩 |

語言 API 無寫入考試資料副作用（既有 nonce 記錄除外）。查詢途中若註冊實例／階段已失效，拒絕回傳；不得在 reset 後傳出舊場清單。

## 2. 桌面版消費與時機

- 首次註冊及助教核准後重新入場成功，主程序背景啟動一次取得。註冊回應不等待 API 或 runner。
- 兩端以相同 fixture 驗證清單。桌面版遇未知語言／缺欄位／非陣列時呈現失敗，不先 filter 再當作成功空集合。
- 在線流程不使用解密考卷作為檢查前提。既有合成探針執行工具鏈、smoke、timeout、memory 檢查，保持原有診斷限制。
- 保留成功清單於 RAM。手動 retry 對同份清單重檢；初次取得失敗允許重試 API。普通重連、登入、config_update 均不刷新成功清單。
- 考前修改語言後須重啟；重啟依現有規則重新註冊／助教審核，再取得最新清單。離線來源保持原本檔案 meta 行為。
- FETCHING、RUNNING、FAILED、UNKNOWN 均不禁止登入或後端合法階段切換；取卷／金鑰本身的既有必要失敗仍正常回報。

## 3. POST /user/exam/environment-report（沿用）

封包、驗證、允許階段沿用主契約。解密內容為 `{ status, failedLanguages, sequence, timestamp, nonce }`；status = RUNNING/PASSED/FAILED。200 回 `{ success: true }`。sequence 為從 1 遞增的正安全整數，作用域為該裝置註冊金鑰；重送同一報告保留 sequence，但使用新的 timestamp/nonce。缺少或無效序號回 400。

每次 run 啟動送一次 RUNNING，終止送 PASSED 或 FAILED。成功或執行中 failedLanguages 為 []；失敗只回語言識別，不送程式碼、stdout/stderr、系統路徑。語言取得失敗可回 FAILED + []，本機保留原因。

回報採一個序列發送者：同一時間只一筆有效回報在送，待送狀態可被更新的狀態取代；收到 HTTP 與應用 success 後才清除。網路錯誤保留最新資料，重連以新 nonce/timestamp 重送。後端以 UUID、驗證過的金鑰及 `env_check_sequence < sequence` 原子條件更新；相同／較舊序號仍回 success 但不寫入、不廣播。延遲的 RUNNING 不可覆蓋最新終態；reset／身分變更丟棄本機舊世代回報，後端更新條件須對應原驗證的註冊實例，避免舊實例覆寫新紀錄。

## 4. manage readiness（沿用）

回報存 DeviceKeyMap 後廣播既有 student data-update；管理端重新取 readiness。學生已綁裝置時，FAILED 的文字與失敗語言優先於「已登入／已就緒」；RUNNING/UNKNOWN 不算通過。修復後同清單 retry、收到 PASSED 後更新。未綁學生的機器不虛構對應，綁定後顯示原裝置報告。

## 5. 契約驗證

新增兩份 `exam-languages.fixture.json`：host 的 backend/test/fixtures 與 desktop 的 test/fixtures；沿用現有 fixture 維護方法並納入同步檢查。合法例至少含全部語言、去重、多題同語言與 []；無效例涵蓋未知語言、缺 languages、null、非陣列。新 schema 及呼叫 adapter 不允許 any。

測試包含五階段矩陣、未註冊／冒用 UUID／錯 key／壞 GCM／nonce 重播、無 session 成功、資訊排除、語言變更後 API 新值、桌面版舊快照直到重啟、登入不中斷、report → database → readiness → UI、reset 與舊請求競態。

## 6. 部署相容性

兩端共同部署本增量；舊桌面版缺 sequence 的回報會被拒絕。後端啟動時檢查 device_key_maps，若缺 env_check_sequence 則新增 INTEGER NOT NULL DEFAULT 0；重複啟動不重建資料表。重新註冊重設序號與環境狀態，不改既有學生作答。
