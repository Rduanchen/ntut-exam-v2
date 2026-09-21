# Bugfix Round 1 — 007 現場走查後的缺陷清單

**日期**: 2026-09-10
**來源**: 007 全部 user story 實作完成後的第一次完整走查
**範圍**: `host/backend`、`desktop`

> 七個缺陷，沒有一個是「還沒做的功能」。每一個都是既有需求在實作中沒有被真正滿足 —— 契約寫對了但欄位放錯、推導寫對了但只註冊在部分頁面、路徑寫對了但依賴的 API 已被移除。
>
> 對應的需求補正見 `spec.md` FR-035 ～ FR-043 與 SC-010 ～ SC-014。

---

## BUG-01 — reset 後桌面版停在原畫面

**現象**: 管理員執行全域 reset，學生機器不會回到等待畫面，停在考試中的畫面。

**根因**: 畫面推導（`derivePage`）本身是對的，`exam:status-changed` 也確實送到了渲染程序，主程序的 `clearForReset()` 也確實清空了狀態。問題在**誰在聽**：`ExamPage.vue` 對這個事件只處理 `FINISHED` 與 `IN_PROGRESS` 兩個值，收到 `UNINITIALIZED` 時什麼都不做。`Settings.vue` 與 `PendingApprovalPage.vue` 則完全沒有訂閱。

「畫面是推導出來的」這件事被寫成了七個頁面各自的 `onMounted`，於是它只在其中五個頁面成立。

**修正**: 訂閱移到 `App.vue` —— 全域階段變更時重新推導，只有一個註冊點。頁面各自的訂閱移除，`ExamPage` 只保留它真正獨有的責任（收卷緩衝計時）。

**需求**: FR-038

---

## BUG-02 — 已佈署 `pre_settings.json` 仍要求輸入後端連結

**現象**: `pre_settings.json` 已指定 `remoteHost`，機器啟動後仍停在設定頁要求輸入後端位址。

**根因**: 兩件事疊在一起。

1. `initFromPreSettings()` 設好 `backendUrl` 並啟動服務後直接 return，沒有讓任何東西知道「這台機器已經被佈署過了」—— `isConfigured` 仍是 `false`。
2. 唯一會把機器帶離設定頁的機制，是 `App.vue` 對連線狀態變化的監聽。但 `initFromPreSettings()` 在 `createWindow()` **之前**執行，socket 往往在視窗存在之前就連上，那一次 `connection:status-changed` 沒有任何接收者。之後不會再有第二次。

**修正**: 設定頁不再是啟動落點。路由守衛在已有後端位址時，把 `settings` 導向推導出的畫面；`Settings.vue` 自己也檢查一次。設定頁仍可在 UNINITIALIZED／INITIALIZED 手動到達（離線佈署考卷需要它），只是不再是預設停留處。

**需求**: FR-039

---

## BUG-03 — 離線機器到不了「以口令開考」的入口

**現象**: 桌面版以檔案載入加密考卷後，無法用階段切換口令開考。

**根因**: `setConfigFromFile()` 會把本機階段設為 `SETUP_FINISHED`，但離線機器從未註冊，裝置狀態是 `UNREGISTERED`。`derivePage('SETUP_FINISHED', 'UNREGISTERED')` 推導出 `pending-approval` —— 一個要等後端核准才能離開的畫面。而離線機器之所以離線，正是因為沒有後端。

口令輸入框在 `WaitingForExamPage`，而那個畫面需要先登入；登入畫面又在待審畫面之後。整條路對離線機器是封死的。

**修正**: 推導多一個輸入 —— 這台機器是不是離線機器。離線機器在 `SETUP_FINISHED` 走向 `login`（以名單手動輸入學號），登入後到 `waiting`，口令入口就在那裡。離線機器永遠不被導向 `pending-approval`。

**需求**: FR-040

---

## BUG-04 — 一次綁定衝突產生無限多筆助教待審申請

**現象**: 重新登入需要助教審核；核准後仍可反覆登入，且系統不斷產生新的審核請求。

**根因**: `HttpError` 的建構子是 `(statusCode, message, code)`，但 `auth.service.ts` 的四個綁定相關錯誤把兩個參數寫反了：

```ts
throw new HttpError(403, "ALREADY_LOGGED_IN", "This student ID is currently logged in on another active device.");
//                       ^ 放到了 message      ^ 放到了 code
```

回應因此變成 `{ error: "ALREADY_LOGGED_IN", code: "This student ID is..." }`。桌面版讀 `data.code` 當錯誤碼，於是：

- 學生看到的訊息是裸的 `ALREADY_LOGGED_IN` 字串（這就是回報中的「重複登入」）。
- `auth.ipc.ts` 裡「綁定類錯誤要保留裝置註冊」的判斷 `errorCode !== 'BINDING_LOCKED' && errorCode !== 'ALREADY_LOGGED_IN'` **永遠成立**，於是一次登入被拒就清掉 `cryptoState`。
- 機器因此退回 `UNREGISTERED` → 推導到 `pending-approval` → 該頁每 5 秒重試註冊 → 註冊已關閉 → 每次都送一筆新的入場申請。助教佇列被同一台機器灌爆。

第二層問題：`BindingService.unbindUser()` 會把 `user.ipAddress` 清成 `null`。那個欄位同時承載「名單指定的座位 IP」與「上次登入的來源 IP」，清掉之後 `loginAndBind` 的來源檢查 `if (user.ipAddress)` 直接跳過 —— 該學號從此在任何座位都能登入。這是「系統會不斷可以登入」。

**修正**:

1. 修正四處參數順序，讓錯誤碼回到 `code` 欄位。
2. 登入失敗不再清除裝置註冊 —— 註冊與登入是兩層獨立狀態（FR-036）。只有後端明確表示裝置不存在時才清。
3. `unbindUser` / `unregisterDevice` 把 `ipAddress` **還原成名單值**而非清空。
4. 助教核准入場時一併發給該次來源位置的例外，換機因此仍可一次完成，不需犧牲其他人的座位限制。

**需求**: FR-035、FR-036、FR-037

---

## BUG-05 — 重新入場核准後考試畫面空白且無錯誤訊息

**現象**: 同一位學生重複登入、助教核准、auto login 成功之後，考試頁面空的，沒有任何錯誤。

**根因**: 解讀能力（exam key）只在**階段變更**時取得 —— `onPhaseChanged()` 只有在輪詢或 socket 發現 `examStatus` 從別的值變成 `IN_PROGRESS` 時才會跑。

但 `/user/exam/status` 是公開端點，機器在登入之前就已經把 `examStatus` 更新成 `IN_PROGRESS` 了。重新入場時階段沒有「變更」，於是那條路徑永遠不會觸發：`examConfigMeta` 與 `examConfigCipher` 都在手上，`examKey` 是 null，`examConfig` 因此是 null，`store:get-puzzle-info` 回傳 `[]`。

而 `auth.ipc.ts` 對 `configService.fetchAndSaveConfig()` 的回傳值完全不檢查，所以連失敗都不會說。

**修正**: 把「確保考卷可讀」變成一個冪等的動作 `ensureExamPaperReadable()`，在登入成功之後與每次收到考卷之後都呼叫一次，而不是掛在階段變更上。取得失敗時明確回報並記錄。

**需求**: FR-041

---

## BUG-06 — reset 後學生一登入就觸發重複登入

**現象**: reset 之後學生登入，立刻被判為重複登入。

**根因**: 與 BUG-04 同源。後端的 reset 確實清空了 `device_key_maps`、`login_requests`、`unblocked_devices`，device 資訊沒有殘留。學生看到的「重複登入」是 BUG-04 的錯位訊息 —— 任何綁定層級的拒絕都會以裸碼字串呈現，而 `ALREADY_LOGGED_IN` 是其中最常出現的一個。

殘留確實存在，但在**機器側**：`clearForReset()` 沒有清掉 `connectionService` 的補送佇列與 logger 的待送佇列，上一場的作答、分數與行為紀錄會在下一場連上線時被送出去。

**修正**: BUG-04 的修正涵蓋訊息面。另外讓 reset 一併清空補送佇列。

**需求**: FR-035、FR-043

---

## BUG-07 — 桌面版無法評分、執行程式碼

**現象**:

```
[Judger] Judge failed: The "paths[0]" argument must be of type string. Received undefined
```

**根因**: `File.path` 是 Electron 的非標準擴充，**已於 Electron 32 移除**。本專案使用 Electron 34，因此 `file.path` 一律是 `undefined`，一路傳到 `localProgramStore.addFile()` 的 `path.resolve(sourcePath)` 才炸開 —— `path.resolve(undefined)` 的錯誤訊息正是 `paths[0]`。

三處受影響：`useUpload.ts`、`ExamPage.vue`（評測）、`Settings.vue`（離線佈署檔）。

**修正**: preload 以 `webUtils.getPathForFile(file)` 提供 `window.api.files.getPath`，三處改用它。同時在 `judger:judge` 的 IPC 入口驗證路徑為非空字串，讓下一個同類錯誤在邊界上就被說清楚，而不是變成一則 `paths[0]`。

**需求**: FR-042

---

## 共同教訓

三個缺陷（01、02、05）形狀相同：**一個正確的中心規則，被實作成散落各處的訂閱點**，於是規則只在其中一部分成立。畫面推導、連線就緒、考卷可讀——三者都該是「隨時可重新計算的冪等動作」，而不是「在某個事件發生時執行一次的副作用」。

兩個缺陷（04、06）源自**同一個介面把碼與訊息放反**。型別上兩者都是 `string`，編譯器沒有任何理由攔下來。契約測試該斷言的是欄位語意，不只是形狀。
