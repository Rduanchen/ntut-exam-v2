# NTUT Exam Host

考試主機系統：後端 (Express + Sequelize)、前端 (Vue)、以及 Piston 程式碼執行引擎。

```bash
pnpm install
pnpm --filter backend test     # 型別檢查 + 測試
docker compose up -d           # 完整堆疊
```

## 執行環境需求

**Node.js >= 20.19.0**（宣告於 `backend/package.json` 的 `engines`）。

這不是偏好，是正確性需求。後端以 CommonJS 編譯，而 `p-limit@7` 是 ESM-only；從 CommonJS `require()` 一個 ESM 套件的能力在 Node 20.19 才出現。實測：**20.20.2 可以，20.18.0 失敗**並拋出 `ERR_REQUIRE_ESM`。

失敗發生在啟動當下，訊息看起來與成因毫無關聯，所以 `Dockerfile` **釘明確版本**而非浮動的 `node:20-alpine`——後者會在建置時解析成當下最新的 20.x，今天剛好滿足，但沒有任何地方記錄它必須滿足。

## 評測容量：怎麼決定併發上限

### 為什麼這件事重要

評測負載的失敗不是漸進的，是**斷崖**。在一台閒置的 12 核機器上實測：

| 併發 | 最大延遲 | 誤判為編譯錯誤的比例 |
|---|---|---|
| 5 | 3.2s | 0% |
| 12 | 4.6s | 0% |
| 20 | 7.3s | 0% |
| **30** | **10.6s** | **23%** |

延遲隨併發近似線性成長，一旦撞上編譯階段的時限就整批崩塌。**平均值在崩塌前一刻看起來仍然健康**——這是為什麼壓測必須回報最大值而不只是 p50/p99。

### 量測你自己那台機器的方法

上表的數字**不能直接照抄**。它是在閒置機器、只跑 Piston 的條件下量的；真實考試機還要同時跑後端、前端、資料庫與作業系統，餘裕會小得多。

沿**併發軸**掃描：

1. 挑一份重編譯成本高的代表性程式碼（例如含 `#include <bits/stdc++.h>` 的 C++）。
2. 在**該台機器的真實負載下**，依序以併發 1 → 5 → 8 → 12 → 16 → 20 → 30 各送固定數量的請求。
3. 記錄每一檔的**最大**延遲與非 AC 比例。
4. 找出兩者同時暴增的交界——那就是斷崖。
5. **把營運上限設在斷崖的一半以下。**

### 兩道上限，各司其職

| 設定 | 位置 | 作用 |
|---|---|---|
| `judgerSettings.maxConcurrentJobs` | `config.json` | 後端**送出**多少併發執行。跟著考卷走。 |
| `PISTON_MAX_CONCURRENT_JOBS` | `docker-compose.yml` | Piston **接受**多少。超出的排隊。 |

兩者互補。應用層的上限限制送出量；Piston 端的上限讓超額**排隊**而不是全部收下然後一起逾時——**排隊等待不計入編譯時限**，這正是把斷崖轉換成背壓的機制。

> ⚠️ `maxConcurrentJobs` 是**機器的能力**，卻跟著 `config.json` 走。這是刻意的取捨：部署模型要求一個 JSON 檔完整定義一台考試機器。代價是把考卷複製到另一台機器時會帶著錯誤的上限——**換機器務必重新量測**。

### Piston 容器設定

`docker-compose.yml` 已包含官方要求但先前缺少的項目：

- `privileged: true` — Piston 的隔離機制必需
- `/piston/jobs` 掛 tmpfs — job 目錄反覆建立刪除，跑在 overlayfs 上時那些 I/O 本身就會造成編譯階段逾時
- `piston-packages` volume — 安裝的語言能在重啟後存活
- `PISTON_OUTPUT_MAX_SIZE` — 預設 1 KiB 會截斷一般的編譯器診斷訊息，讓真正的編譯錯誤變得無法閱讀
- CPU 與記憶體上限 — 讓評測不會餓死它所寄生的那台考試機

## 考試前檢查

```
GET /admin/judger/health
```

回報 Piston 是否可達，以及**實際安裝了哪些語言**。值得在每場考試前確認——開發期間就曾遇到一台只裝了 gcc 系列、完全沒有 Python/Java/JavaScript 的 Piston，而在此之前沒有任何地方會顯示這件事。

```
GET /admin/judger/settings
```

回報每一個生效的設定值，**以及它的來源**（`config` / `env` / `default` / `clamped`）。來源欄位的存在是為了區分「10 秒是因為有人量過」與「10 秒是因為沒人選過」——正是後者讓最初那個靜默的編譯時限一直隱形，直到它開始扣學生的分數。

`clamped` 表示設定值超出有效範圍而未被採用。無效的併發上限一律會被夾回範圍內，**絕不會被當成「無上限」**。

## 部署後 Judger 自我測試

管理員可直接在 `http://<host>:5173/judge` 內切換到 **Deploy Test** 分頁；執行、進度、各 probe 結果、併發統計與 JSON 匯出都留在同一個 `/judge` 頁面。預設測試會：

- 實際編譯並執行 C、C++、Python；缺少的 runtime 會明確標成 blocked。
- 驗證 CE、RE、TLE、MLE、OLE 的 verdict 與 `submission` 歸因，並在 OLE 後再做一次健康執行。
- 將 100 筆工作分配到由實際全域上限推導的併發層級，顯示 submitted/observed concurrency、完整 accounting、throughput，以及 queue/execution/total latency 的 p50、p95、p99、max。

按下 **執行測試** 前會再次確認。考試進行中、學生評測仍在執行、另一個部署測試正在執行或 draining 時，系統會拒絕開始；部署測試和學生工作共用同一個全域 limiter，不會繞過正式執行路徑，也不會建立 Submission、改寫 ScoreBoard 或發送學生分數事件。

報告的 lifecycle 與結果要分開解讀：`completed` 只代表測試流程正常收尾；`passed` 才是全數成功，`warning` 代表例如送入的併發高於生效 ceiling、但已安全排隊，`failed` 代表 probe 或基礎設施證據不符，`interrupted` 則會附上 deadline、考試開始或 process restart 原因。所有診斷最多保留 5,000 字元、每個併發層級最多 10 筆錯誤樣本。

部署時必須設定 `ADMIN_TOKEN`；Compose 仍接受既有 `ADMIN_SECRET` 作為相容 fallback，但新部署應使用前者。Piston 的 `PISTON_COMPILE_TIMEOUT` 必須不小於後端實際使用的 compile timeout；本專案 Compose 預設為 30 秒。若連到 stock Piston（上限通常為 10 秒），請同步將 Judger Settings 的 compile timeout 調到 10 秒或提高 Piston 上限，否則健康的編譯會被 Piston 拒絕。

profile 的伺服器端安全範圍為：併發 1–64、最多 8 個遞增且不重複的層級、工作數 1–500、deadline 60–1,800 秒。deadline 到達後報告立即凍結，尚未完成的工作列入 `interrupted`，但目前 Piston client 沒有 transport abort；已送出的 HTTP 工作仍會 draining 到真正結束，這段期間不會虛假釋放 limiter，也不能開始下一次部署測試。最新報告由後端保存，重新整理 `/judge` 後會恢復，瀏覽器 localStorage 不作為結果真相。

Deploy Test 的 profile 表單在欄位失焦時，會把 phases、concurrency levels、job count 與 deadline 草稿保存在目前瀏覽器；重新整理後會先取得伺服器最新 bounds，再恢復仍然合法的草稿。這份瀏覽器草稿只提供操作便利，執行狀態與報告仍完全以後端資料為準。
