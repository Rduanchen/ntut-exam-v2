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

## 4. 測試碼被排除在型別檢查之外，導致 fixture 靜默腐化

- **預期 (Theory said)**: 測試通過就代表測試有效；schema 變更會讓相關測試自然失敗而被發現。
- **實際發生 (Actually happened)**: `backend/tsconfig.json` 的 `include` 只有 `src/**/*`，測試碼從未被 `tsc` 檢查。`b2729ae` 把 `environmentVariables.startPassword` 改為必填後，多個測試檔中重複複製的 `validConfig` fixture 全部失效，紅燈持續約兩個月（2026-06-21 → 2026-08-23）無人察覺。同期還有三層更深的漂移被第一層錯誤遮住：`checkUserAction` 的呼叫契約改為 `actionType='alert'` + `details.type`、`restrictedUpdate` 改為結構不可變檢查、`ae7470f` 將 device 綁定與初始化解耦。
- **解決方案 (Resolved by)**: 新增 `backend/tsconfig.test.json` 將 `test/**/*` 納入 strict 型別檢查，並把它接到 `npm run test`（`tsc -p tsconfig.test.json && vitest run`）；同時把重複的 fixture 收斂成 `test/fixtures/` 下型別綁定 production 型別的單一 builder。
- **教訓 (Lesson)**: 沒有 oracle 的東西會腐化。測試碼本身缺乏守護者——除非讓型別系統成為它的守護者。**fixture 必須型別綁定到 production schema 且只有單一來源**，否則 schema 演進時會靜默脫鉤。另一個推論：測試「綠燈」不等於「有效」——`exam-config` 有一個斷言長期因為錯誤的理由而通過。

## 5. TS 模組內的 runtime `require()` 是隱藏的 ESM 地雷

- **預期 (Theory said)**: 在 controller 內用 `require()` 動態載入 model 可以規避循環相依，且行為與 `import` 相同。
- **實際發生 (Actually happened)**: 撰寫 controller 整合測試時，`POST /admin/init/reset` 在 vitest 下回傳 500——`Cannot find module '../../models/login-request.model'`。正式環境因為 `tsc` 編譯成 CommonJS 而僥倖可行，但同樣的程式碼在任何 ESM 環境會於執行期失敗，且失敗點落在**資料庫重置**這種破壞性操作上。共發現 5 處（`exam-config.controller.ts` 2 處、`connection.controller.ts` 4 處）。
- **解決方案 (Resolved by)**: 全數改為頂層 static import；確認並無循環相依（`binding.service` 不反向依賴 controller）。
- **教訓 (Lesson)**: `require()` 在 TS 專案中會跳過模組圖，讓打包器與型別檢查都看不見它。它只在 CommonJS 編譯目標下能運作，屬於「現在能跑、未來會炸」的相依。**整合測試的價值不只在驗證 API 行為，更在於它會以與正式環境不同的模組載入方式執行同一段程式碼，因而暴露這類環境耦合。**
