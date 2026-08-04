# 經驗與教訓 (Experience)

## 1. Judger 輸出過長導致系統凍結
- **預期 (Theory said)**: 程式碼執行後的實際輸出可以直接存入資料庫與回傳給前端展示。
- **實際發生 (Actually happened)**: 學生送交的程式碼若產生極大輸出，會造成 Judger 系統凍結（System Freezes）並引發 SE (System Error)。
- **解決方案 (Resolved by)**: 在 `02928e7` 中實作了「截斷實際輸出 (Truncate actual output)」的機制。
- **教訓 (Lesson)**: 所有不受信任的外部輸出都必須在處理與儲存前實施長度截斷防護。

## 2. 裝置與 IP 綁定的防作弊死角
- **預期 (Theory said)**: 在使用者登入時綁定單一 IP 與裝置 ID，即可避免帳號共用與防作弊。
- **實際發生 (Actually happened)**: IP 抓取有時會失效或造成誤報，且遇到正常換機時缺乏流暢的審核機制。
- **解決方案 (Resolved by)**: 在 `cc86e4d` 及後續 Commit 中，導入了 TA 審核的裝置重綁定機制，解綁時自動清除舊 IP，並在防作弊檢查加入 IP fallback 邏輯 (`592028c`)。
- **教訓 (Lesson)**: 防作弊的識別特徵（IP、裝置）需要考量例外狀況（fallback），且解鎖與重綁定必須由高權限 (TA) 進行人工核准，並且與使用者初始化邏輯解耦 (`ae7470f`)。

## 3. 設定檔與初始化的嚴格性
- **預期 (Theory said)**: 系統可以依賴預設的設定檔運作，管理員可在需要時修改。
- **實際發生 (Actually happened)**: 缺乏嚴格防護的情況下，可能會在未設定啟動密碼 (startPassword) 的情況下暴露考試環境。
- **解決方案 (Resolved by)**: 引入 `ExamConfigParserService` 統一管理設定，並強制在設定檔中驗證 `startPassword` (`b2729ae`)，UI 上也要求在初始化前必須儲存 (`676b8a6`)。
- **教訓 (Lesson)**: 考試環境的初始化必須是強制的、嚴格校驗的，避免任何預設配置導致的安全漏洞。
