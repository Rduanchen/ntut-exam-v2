# Piston 穩定度與併發問題排查

## 緣起與問題
實際考試機上，**同一份程式碼重複評測會隨機得到 CE**。學生因此被系統的失敗判成自己寫錯。

## 已被推翻的初始猜測（保留，避免重猜）
最初列了三個方向，實測後**全部不成立或不是主因**：
- ~~「Piston 容器在高併發下資源衝突或不足」~~ → 方向對但描述錯：不是「資源衝突」，是**編譯階段撞到 wall-clock 逾時**。
- ~~「套件相容性問題」~~ → 無關。
- ~~「外部編譯器呼叫機制的潛在缺陷」~~ → 編譯器本身沒問題，是**呼叫端的狀態分類**有問題。

教訓：症狀的隨機性讓人往「不穩定」猜，但隨機性的真正來源是**負載相依的臨界行為**。

## 真因（2026-08-26 實測確認）

### 一、誤判：編譯逾時被歸類成 CE
`piston-judger` 的 `isCompilationError()`：

```js
return result.compile.code !== 0 || result.compile.status === "RE";
```

編譯被 SIGKILL 時 Piston 回傳 `code: null`、`signal: "SIGKILL"`、`status: "TO"`、`message: "Time limit exceeded (wall clock)"`、`stderr: ""`。
`null !== 0` → 判 CE，訊息還是空的 `Compilation Error: Unknown error`。

**這是資訊遺失**：`judge()` 回傳的 status 已無法區分「學生寫錯」與「機器過載」。
佐證：`judger.service.ts` 已經被迫在呼叫 `judge()` 前手動前置判斷 `executeRes.success === false || executeRes.error || !executeRes.run` — 呼叫端繞過抽象，就是抽象不合用的訊號。

### 二、放大器：p-limit 開在錯的層級
`judger.service.ts` 的 `pLimit(5)` 是**每次 HTTP 請求各自建立**的，不是全域。
`POST /admin/judger/judge/:testId` 一位學生一次呼叫 → **N 位學生同時評測 = 5N 個併發 Piston job，完全沒有上限。**

### 三、負載來源：每個測資都重新編譯一次
`judger.service.ts` 的 visible/hidden 迴圈逐測資呼叫 `judger.execute()`，Piston 無編譯快取。
一題 20 筆測資 = 20 次完整 g++。這是併發預算天花板的根源。

### 四、`compile_timeout` 從未被設定
程式只傳 `run_timeout` / `run_memory_limit`，`compile_timeout` 落回套件內硬編的 **10000ms**（`client.js` 的 `or(config.compile_timeout, 10000)`）。預設值藏在套件裡，呼叫端不知情。

### 五、Piston 容器設定不足
`docker-compose.yml` 只有 image + ports。官方要求的 `privileged: true`、`/piston/jobs` tmpfs、packages volume 全缺；`PISTON_MAX_CONCURRENT_JOBS`（預設 64）遠超機器負荷，所以 Piston 照單全收後一起逾時，而不是排隊。

### 實測數據（12 核 Mac、閒置、`#include <bits/stdc++.h>`）
| 併發 | max 延遲 | CE 率 |
|---|---|---|
| 1 | 1.6s | 0 |
| 5 | 3.2s | 0 |
| 8 | 3.7s | 0 |
| 12 | 4.6s | 0 |
| 16 | 5.8s | 0 |
| 20 | 7.3s | 0 |
| 30 | 10.6s | **23%** |

延遲隨併發近似線性，撞到 10s `compile_timeout` 是**斷崖**而非漸進劣化。

## 已定案的設計決策
1. **`config.json` = 考試機器的完整設定來源**，上傳即**全量取代**（含機器容量參數）。欄位缺席 → 回落程式預設，不保留現值。理由與被否決的選項見 `history/確立考卷即機器完整設定.md`。
2. **獨立的「評測器設定」頁**，但不與考卷全線切割 — 上傳 config.json 一樣會覆蓋此頁設定。
3. **評測改為非同步**：立刻回 202 → 背景跑 → `SocketService` 通知。這是加全域 limiter 的**必要配套**，否則排隊會把 CE 換成 HTTP timeout。
4. **修上游 `piston-judger`（`~/Documents/my-code/ntut-exam/node-piston`）並發布 npm**，而非在 `src/` 下內化。發布由人類執行。

## 實作計畫
**A. `node-piston`（上游）— ✅ 已完成，2026-08-27 發布 `piston-judger@0.2.0`**
1. 清掉 debug 殘留（`src/index.ts` 有 top-level `test2()` 會在 import 時打 Piston；`client.ts` 有 `console.log` 會印出學生完整執行結果；無用的 `import { VERSION } from "axios"`）。保留 prettier 排版變動。
2. `judge()` 不再把 compile 的 `TO`/`SIGKILL` 壓成 CE，保留完整 stage 原始資訊讓呼叫端自行分類。
3. `isMemoryExceeded` 拿掉 `stderr.includes("Killed")` 字串比對（學生自己印 "Killed" 會誤判 MLE），改看 `signal`/`status`。
4. `runtimes` 快取加 TTL。
5. `compile_timeout` 預設不再靜默藏在套件裡。
6. 補 vitest 涵蓋上述誤判情境。
7. bump `0.2.0`（breaking）→ build → `npm pack` 供驗證 → **人類 publish**。

> **完成紀錄（feature `003-judge-fault-attribution`，commits `dd6238b` / `0ea8ba0` / `d299eb8`）**
> 39 tests 綠燈（原 31）。新契約：每個判定都帶 `attribution`（submission / system），新增 `CTLE` 判定碼，
> `judge()` 接受執行失敗分支不再拋例外，`Result = any` 換成可收窄的 discriminated union。
>
> **驗證產物（而非原始碼）額外抓到兩個缺陷**，兩者原始碼層面都看不見：
> 1. `dist/` 從未清理，tsc 不刪除已移除來源的產物 → `dist/test.js`、`dist/src/example.js`、
>    `dist/test/fixtures/` 長期被發布（`.npmignore` 排的是 repo 根目錄的 `src`/`test`，不是 `dist` 內）。
> 2. 清乾淨後才發現套件**根本沒有型別宣告** —— 原本的 `.d.ts` 是舊 config 的陳舊殘留，
>    現行 tsconfig 從未開 `declaration`。就這樣發布會讓消費端退回 implicit `any`，
>    等於抹掉這個版本存在的理由。
>
> **第三個陷阱**：新增的 `tsconfig.test.json` 第一版回報 0 錯誤 —— `extends` 會**繼承 `exclude`**，
> 而 build config 排除測試檔。它當時正在「檢查」一批引用已刪除型別的測試卻一片綠。
> 必須顯式重述 `exclude`。這是 `experience.md` #4 腐化模式的第二次現身。

**B. `host/backend`**
1. `src/config/judge.config.ts`；順手清掉 `constants/piston.config.ts` 的死碼（`CPU_TIME_LIMIT_MS`/`WALL_TIME_LIMIT_MS`/`MEMORY_LIMIT_KB` 無任何引用）。
2. schema + type 加新欄位（全 optional，舊 config.json 才不會驗證失敗）。
3. p-limit 提到**模組層級、包在最底層 execute 上**（不是請求層）；升級 p-limit 以支援熱改 concurrency（3.1.0 的 `concurrency` 是閉包常數，無 setter）。
4. 評測改非同步。
5. compile 逾時 → 標 SE 並重試，**不判 CE**。

**C. `host/frontend`**
1. 獨立「評測器設定」頁（評測規則 / 機器容量 / Piston 容器唯讀三區）。
2. Piston 健康檢查與 runtimes 顯示（這台目前**只裝 gcc 系列，無 python/java/js**，此 UI 會立刻暴露）。

**D. `README.md`**
Piston container 推薦設定：`privileged: true`、`/piston/jobs` tmpfs、`PISTON_MAX_CONCURRENT_JOBS ≈ 核心數`、資源限制，附上表格數據當調參依據。

## 狀態
In-flight Rationale。診斷已完成並經實測驗證；設計已定案。

- **A 段（上游套件）✅ 完成** — `piston-judger@0.2.0` 於 2026-08-27 發布。
- **B/C/D 段（後端遷移、設定頁、README）尚未開始。**

⚠️ **production 的事故尚未關閉。** 後端仍在使用 0.1.1 的舊行為；A 段只是讓上游能正確歸因，
消費端遷移完成前，學生仍可能被誤判。全部完成後應反流至 `experience.md`（#6 的 Resolved-by
目前仍留白待補），本檔退場。

## 關聯
- 概念：`concepts/失敗歸因的隔離.md`
- 決策轉變：`history/確立考卷即機器完整設定.md`
- 量測手法與後續制度化：`draft/部署後壓測機制設計.md`
