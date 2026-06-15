# NTUT Exam System - 完整部署測試清單 (Comprehensive Test Checklist)

這份清單涵蓋了系統實際部署與運行時，必須驗證的各項核心功能，確保 Host 端 (後端與管理介面) 與 Desktop 端 (學生考試應用程式) 的互動、防作弊、批改機制皆運作正常。

## 1. 系統初始化與連線 (System Initialization & Connection)

### Host (Backend & Frontend)
- [ ] 啟動 Host 端服務 (Backend & Frontend)，確認終端機無錯誤輸出。
- [ ] 測試 Host 端可否正常進入管理網頁介面。
- [ ] 確認系統資料庫 (`ntut-exam.sqlite`) 正常讀寫，未建立時能自動初始化預設配置。
- [ ] 測試 `manage` 與 `config` 頁面，修改並儲存考試設定 (如：考試標題、開放語言、時間限制)，確認設定持久化。

### Desktop (Client Application)
- [ ] 啟動 Desktop 應用程式，確認畫面正確顯示 `WelcomePage` 或 `NotInitializedPage`。
- [ ] 進入 `Settings`，設定 Host 的 IP/Port，確認是否能連通。
- [ ] 於 `LoginPage` 進行學生登入，確認學號/密碼(如有)驗證邏輯與 Host 同步。
- [ ] 確認 Desktop 登入後，進入 `WaitingForExamPage` 等待狀態。

### 連線狀態同步
- [ ] 登入多台 Desktop 裝置，確認 Host 端的 `connection` 頁面能即時顯示所有連線的學生裝置。
- [ ] 測試強制關閉 Desktop 程式，確認 Host 端能偵測並標示該設備為斷線 (Offline)。
- [ ] 斷線後重新啟動 Desktop 程式，確認能無縫重連，並且恢復先前的狀態。

## 2. 考試流程控制 (Exam Flow & State)

### 狀態變更測試
- [ ] 於 Host 端點擊「開始考試」，確認所有 Desktop 端即時從 `WaitingForExamPage` 切換至 `ExamPage`。
- [ ] 於 Host 端點擊「暫停考試」，確認所有 Desktop 端畫面被鎖定或提示考試暫停，且無法繼續作答/提交。
- [ ] 於 Host 端點擊「結束考試」或考試時間倒數結束，確認所有 Desktop 端切換至 `ExamFinishedPage`，並停止所有背景作業。

## 3. Desktop 端本地功能與批改 (Desktop Local Judge & Features)

### 編輯器與本地運行
- [ ] 於 `ExamPage` 撰寫程式碼，測試本地編譯/執行按鈕 (Local Run)，確認能透過 Desktop 內建的 `node-judger` / `localProgram.service` 正確執行並顯示輸出。
- [ ] 測試各種支援語言 (如 C, C++, Python, Java 等) 的本地編譯是否正常。

### 提交與遠端批改 (Submission & Remote Judge)
- [ ] **正確解答 (AC)**：提交正確程式碼，確認 Desktop 顯示上傳中，並最終收到 AC 與滿分。
- [ ] **錯誤解答 (WA)**：提交錯誤邏輯，確認收到 WA 與對應的部分分數。
- [ ] **編譯錯誤 (CE)**：提交語法錯誤程式，確認收到 CE，且 Desktop / Host 皆未崩潰。
- [ ] **執行時錯誤 (RE) 與 超時 (TLE)**：提交無窮迴圈或除以零程式，確認被正確中斷並標示 TLE/RE。

## 4. Host 端成績計算與管理 (Host Score & Management)

- [ ] **成績看板 (`score` 頁面)**：確認學生提交後，成績列表能即時更新並顯示最高分與各題明細。
- [ ] **提交紀錄 (`student` / 提交列表)**：點開特定提交紀錄，確認能看到學生的原始碼、詳細錯誤 Log 與各測資點的結果。
- [ ] **重新批改 (Rejudge)**：測試 Host 端的重新批改功能，確認狀態能從 Pending 重新轉為最終結果，且分數更新正確。
- [ ] **成績匯出**：測試下載成績單功能 (若有)，確認資料格式 (CSV/Excel) 與內容正確。

## 5. 防作弊機制與設備監控 (Anti-Cheat & Device Monitoring)

### Desktop 端防禦
- [ ] **加密通訊**：確認 Desktop 與 Host 的 API 傳輸加密 (若有透過 `crypto.service`) 正常運作，無報錯。
- [ ] **切換視窗偵測**：在考試中途，Desktop 端切換至其他應用程式或瀏覽器標籤，確認能觸發本地警告。
- [ ] **程序監控**：確認 Desktop 端有正確讀取並上報當前運行的應用程式 / Process 列表。

### Host 端監控 (`anticheat`, `device` 頁面)
- [ ] **作弊警告列表**：確認 Host 的 `anticheat` 頁面能即時收到 Desktop 上報的切換視窗、異常程序等警告。
- [ ] **設備狀態監控**：確認 Host 的 `device` 頁面能正確顯示學生的設備資源使用情況。
- [ ] **遠端螢幕截圖**：Host 主動對特定 Desktop 發起螢幕截圖請求，確認 Desktop 正確截圖並回傳，且 Host 能順利顯示畫面。

## 6. 訊息同步與系統日誌 (Message Sync & Logs)

### 訊息推播
- [ ] **全域廣播**：Host 端發送公告訊息，確認所有 Desktop 端的介面有跳出提示或對話框 (`message-sync.service` 運作正常)。
- [ ] **私人訊息**：Host 端針對單一學生發送訊息，確認只有該特定的 Desktop 收到並顯示。

### 日誌紀錄
- [ ] **Desktop 本地 Log**：確認 Desktop 的 `main.log` 有正確記錄重要事件 (如：登入、提交、收到警告、報錯)。
- [ ] **Host 系統 Log**：檢查系統重要操作 (設定更改、作弊警告、連線中斷) 是否都詳細記錄於 Host 的 `log` 頁面與資料庫中。

## 7. 壓力測試與邊緣情境 (Stress Test & Edge Cases)
- [ ] **大量連線/提交**：模擬多台 Desktop 同時登入或同時提交程式碼，觀察 Host 伺服器與 Judger Queue 排隊機制是否穩定，不報錯。
- [ ] **Isolate/Judger 異常恢復**：人為造成 Judger / Isolate 錯誤 (例如移除權限或配置錯誤)，確認系統能捕捉錯誤 (Error Handling) 而非直接崩潰，且能給予適當提示。
- [ ] **本地端崩潰重啟**：使用工作管理員強制結束 Desktop 進程，確認重啟並重新登入後，先前的作答程式碼、考試進度狀態、收到的訊息都有順利保留並還原 (RAM Store / 遠端狀態同步機制正常)。
