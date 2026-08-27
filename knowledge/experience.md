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

## 6. 編譯逾時被誤判為 CE —— 系統的失敗記在學生帳上

- **預期 (Theory said)**: 同一份程式碼重複評測應得到相同結果；Piston 回傳的狀態可直接映射成判定碼。
- **實際發生 (Actually happened)**: 真實考試機上，**同一份程式碼會隨機得到 CE**。實測（2026-08-26）證實成因鏈有三段：
  1. **誤判**：`piston-judger` 的 `isCompilationError()` 以 `compile.code !== 0` 判斷。編譯階段被 wall-clock 逾時 SIGKILL 時 Piston 回 `code: null` / `signal: SIGKILL` / `status: "TO"` / `stderr: ""`，`null !== 0` 成立 → 判學生 CE，訊息還是空的 `Compilation Error: Unknown error`。
  2. **放大**：`judger.service.ts` 的 `pLimit(5)` 是**每次 HTTP 請求各自建立**的。`POST /admin/judger/judge/:testId` 一位學生一次呼叫 → N 位學生同時評測 = **5N 個併發 Piston job，無全域上限**。
  3. **負載來源**：每個測資都完整重編譯一次（Piston 無編譯快取），一題 20 筆測資 = 20 次 g++；且 `compile_timeout` 從未被明確設定，落回套件內硬編的 10s。
  
  併發 sweep 顯示延遲隨併發近似線性成長，撞到 10s 後是**斷崖**而非漸進劣化：併發 20 時 max 7.3s / CE 0%，併發 30 時 max 10.6s / **CE 23%**。
- **解決方案 (Resolved by)**: 分兩個 feature 完成。
  - **上游**（feature `003-judge-fault-attribution`，`dd6238b` / `0ea8ba0` / `d299eb8`）：`piston-judger@0.2.0` 於 2026-08-27 發布。每個判定帶 `attribution`，新增 `CTLE`，`judge()` 接受執行失敗分支，`Result = any` 換成可收窄的 union。
  - **後端**（feature `004-judge-backend-migration`，`41768ce` / `52186e2` / `2c76117` / `2df1005`）：評分改讀 attribution，系統性失敗重試且不計分；`pLimit` 從每請求提升為全域並下沉到 execute 呼叫；評測改非同步（202 + socket）；設定收進 `config.json` 並附來源標記；Piston 容器補上 privileged / tmpfs / 自身併發上限。
- **教訓 (Lesson)**:
  1. **隨機的症狀不代表隨機的成因。** 最初三個猜測（資源衝突、套件相容性、編譯器缺陷）全部落空，因為隨機性其實來自**負載相依的臨界行為**。沿併發軸做一次 sweep 就定位了；憑症狀的「感覺」猜測則走了兩個月冤枉路。**面對隨機性，先找臨界點，不要先找瑕疵。**
  2. **併發限制器必須包在最底層的資源呼叫上，不能包在請求層。** 包在請求層時，保護強度取決於「同時有幾個請求」這個系統無法控制的變數。目前 1 request : 1 concurrent job 只是內層迴圈剛好序列執行的巧合 —— 一旦有人把測資並行化，保護就無聲失效。**limiter 要貼著被保護的稀缺資源，不是貼著呼叫者。**
  3. **抽象被呼叫端繞過，就是抽象不合用的訊號。** `judger.service.ts` 早已在呼叫 `judge()` 前手動前置判斷 `executeRes.success === false || executeRes.error || !executeRes.run`。那段防禦性程式碼是 bug 的自白 —— 作者當時已隱約知道分類不可信，卻選擇繞過而非回頭修分類器。**「繞過抽象的程式碼」值得被當成 code smell 主動搜尋。**
  4. **預設值藏在依賴裡，等於沒有預設值。** `compile_timeout` 的 10s 寫在 `piston-judger` 的 `or(config.compile_timeout, 10000)`，呼叫端完全不知情，卻是這次事故的引信。**會影響正確性的參數必須在呼叫端顯式傳遞**，而且要能回報「這個值從哪來」——否則「30 秒是因為有人量過」與「30 秒是因為沒人選過」無從分辨。
  5. **`any` 會讓破壞性契約變更對編譯器隱形。** 把 `piston-judger` 從 0.1.1 升到 0.2.0——一次刻意的 breaking change——在整個 judging service 只產生 **2 個型別錯誤**，因為那段程式碼到處是 `any`。直接升級上線會編譯通過然後靜默地錯。這比規格書上任何一句「要型別安全」都更能說明理由。
  6. **驗證產物，不要只驗證原始碼。** 只檢查 `src/` 會漏掉：`dist/` 從未清理所以已刪除檔案持續被發布、以及套件其實根本沒有型別宣告。兩者都只有在檢視實際交付物時才會現形。

（相關概念：`concepts/失敗歸因的隔離.md`；決策脈絡：`history/確立考卷即機器完整設定.md`）
