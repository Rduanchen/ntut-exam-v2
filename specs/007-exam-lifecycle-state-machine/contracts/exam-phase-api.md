# Contract: Exam Phase, Paper Delivery, and Re-entry API

**Feature**: 007-exam-lifecycle-state-machine
**Contract type**: HTTP endpoints + socket events between `host/backend` and `desktop`
**Breaking**: yes — 學生端與後端必須同時佈署。考試機器為一次性使用，不提供向後相容。

本文定義形狀與保證，不定義實作。

---

## 1. 階段值域

```
ExamPhase = "UNINITIALIZED" | "INITIALIZED" | "SETUP_FINISHED" | "IN_PROGRESS" | "FINISHED"
```

取代現行的 `"UNINITIALIZED" | "NOT_STARTED" | "IN_PROGRESS" | "FINISHED"`。

**G1 — 值域一致**：後端 enum、socket 廣播內容、桌面版型別、管理端 UI 使用完全相同的五個字串。任一端出現不在此集合中的值，另一端必須視為錯誤而非未知階段。

---

## 2. 階段權限矩陣

**G2 — 矩陣即契約**：下表是後端在 `/user/*` 上實際強制的規則。桌面版的路由守衛只影響畫面，不構成安全邊界。

| 端點 | `UNINITIALIZED` | `INITIALIZED` | `SETUP_FINISHED` | `IN_PROGRESS` | `FINISHED` |
|---|:---:|:---:|:---:|:---:|:---:|
| `GET /user/auth/rsa-public-key` | ✗ | ✓ | ✓ | ✓ | ✗ |
| `POST /user/auth/register-device` | ✗ | ✓ | 閘門 | 閘門 | ✗ |
| `GET /user/auth/student-id` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `POST /user/auth/login` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `POST /user/exam/config` | ✗ | ✓ | ✓ | ✓ | ✗ |
| `POST /user/exam/key` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `POST /user/exam/environment-report` | ✗ | ✓ | ✓ | ✓ | ✗ |
| `POST /user/exam/messages` | ✗ | ✓ | ✓ | ✓ | ✓ |
| `GET /user/exam/status` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /user/submissions/code` | ✗ | ✗ | ✗ | ✓ | 緩衝期內 |
| `POST /user/submissions/score` | ✗ | ✗ | ✗ | ✓ | 緩衝期內 |
| `GET /user/submissions/codes` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `POST /user/log` | ✗ | ✓ | ✓ | ✓ | ✓ |

- **✗** → `409 Conflict`，body `{ error: "phase_not_allowed", phase: <目前階段> }`
- **閘門** → 見 §5，`403` 並建立入場申請
- **緩衝期內** → `FINISHED` 廣播後 `submitGraceSeconds` 秒內視為 ✓，之後為 ✗

**G3 — 預設拒絕**：矩陣未列出的 `/user/*` 端點一律拒絕。新增端點必須顯式加入本表。

---

## 3. 管理端：階段轉移

### `GET /admin/exam-state`

```
200 → { success: true, state: ExamPhase, allowedNext: ExamPhase[] }
```

`allowedNext` 至多一個元素（單向），`FINISHED` 時為空陣列。

### `POST /admin/exam-state`

```
body → { state: ExamPhase }
200  → { success: true, state: ExamPhase }
400  → { error: "invalid_transition", from: ExamPhase, to: ExamPhase }
409  → { error: "preconditions_not_met", missing: string[] }
```

**G4 — 單向**：僅接受 `data-model.md` §1 轉移表中的組合。跳階、回退、`from === to` 一律 `400`。

**G5 — 前置條件**：`UNINITIALIZED → INITIALIZED` 必須四項前置全部成立，否則 `409` 並列出缺少的項目。

### `POST /admin/init/reset`

```
body → { confirm: "RESET" }
200  → { success: true }
```

**G6 — reset 不是階段轉移**：其程式路徑與 `POST /admin/exam-state` 分離，且必然廣播 `exam-reset`（§7）。

---

## 4. 學生端：考卷與金鑰

### `POST /user/exam/config`

**驗證層級**：已註冊裝置（裝置 AES 金鑰可解密請求）。**不需 session token** —— 此端點在登入前即須可用。

```
request  → AES-GCM({ timestamp, nonce }) + device_uuid
200      → AES-GCM({ meta: ExamConfigMeta, cipher: { iv, ciphertext, tag } }) + device_uuid
409      → { error: "phase_not_allowed", phase }
```

**G7 — 放寬驗證不擴大風險**：回應中的 `cipher` 沒有 `K_exam` 無法解讀，因此免除 session token 不會使測資更易取得。

**G8 — meta 的排除清單**：`meta` 中不得出現 `input`、`output`、`puzzles[].title`、`puzzles[].score`、`puzzles[].subtasks`、`puzzles[].specialRules`、`globalSpecialRules`、`environmentVariables.startPassword`。此為可自動檢查的斷言。

### `POST /user/exam/key`（新增）

**驗證層級**：已註冊裝置 **且** 已登入（session token）。

```
request  → AES-GCM({ session_token, timestamp, nonce }) + device_uuid
200      → AES-GCM({ examKey: <hex> }) + device_uuid
409      → { error: "phase_not_allowed", phase }
```

**G9 — 僅 `IN_PROGRESS`**：其餘任何階段一律 `409`，且回應不得洩漏金鑰是否存在。

**G10 — 絕不廣播**：`K_exam` 只經此端點傳遞。socket 事件不得攜帶金鑰、金鑰片段或可導出金鑰的資訊。

**G11 — 冪等**：重複呼叫回傳同一把金鑰，無副作用。

### `POST /user/exam/environment-report`（新增）

**驗證層級**：已註冊裝置。**不需 session token** —— 環境檢查發生於 `INITIALIZED`，此時尚未登入。

```
request → AES-GCM({ status, failedLanguages, timestamp, nonce }) + device_uuid
          status ∈ "RUNNING" | "PASSED" | "FAILED"
          failedLanguages: string[]
200     → { success: true }
```

**G12 — 不含診斷輸出**：payload 僅有狀態與語言名稱。完整報告留在桌面版本機。

---

## 5. 學生端：註冊與入場閘門

### `POST /user/auth/register-device`

| 階段 | 行為 |
|---|---|
| `INITIALIZED` | 自助註冊，`200` |
| `SETUP_FINISHED` / `IN_PROGRESS` | 建立入場申請，`403 { error: "entry_pending", requestId }` |
| 其他 | `409 { error: "phase_not_allowed" }` |

**G13 — 拒絕無副作用**：回傳 `403` 或 `409` 的請求，不得修改 `DeviceKeyMap` 的任何欄位。特別是不得變更既有裝置的 `status`。

**G14 — 申請去重**：同一 `deviceUuid` 已有 `PENDING` 申請時，不建立第二筆，回傳既有的 `requestId`。

**G15 — 重來即重新註冊**：桌面版重啟後產生新的裝置 AES 金鑰並呼叫本端點。後端不區分「重啟」與「他人冒用」—— 兩者形狀相同，一律走入場申請。此為刻意設計。

---

## 6. 管理端：入場申請處理

### `GET /admin/connection/requests`

```
200 → Array<{
  id, deviceUuid, ipAddress, createdAt,
  type: "NEW_DEVICE" | "REBIND" | "UNBOUND_DEVICE",
  previousTestId: string | null,
  previousStudentName: string | null,
  previousStudentOnlineElsewhere: boolean,
  lastDisconnectedAt: string | null,
  ipMatchesRoster: boolean
}>
```

**G16 — 判斷資訊完備**：助教不需查詢其他畫面即可決定處置（`spec.md` SC-007）。

### `POST /admin/connection/requests/:id/approve`

```
body → { targetTestId?: string }
200  → { success: true, unbound: string[] }
```

**G17 — 一次解完兩邊**：當 `targetTestId` 與 `previousTestId` 不同，同一次呼叫必須解除該裝置與 `previousTestId` 的綁定、以及 `targetTestId` 與其原裝置的綁定。`unbound` 回報實際解除的項目。

### `POST /admin/device/:deviceUuid/re-entry`（新增）

```
200 → { success: true }
```

**G18 — 重來的清除邊界**：刪除該 `deviceUuid` 的註冊與綁定，強制登出；**不得**觸及該學號的 `Submission` 與 `ScoreBoard`。

---

## 7. Socket 事件

### `exam-message`（既有，維持）

階段轉移廣播，`namespace: "STATUS"`，`message` 為新的 `ExamPhase` 值。

**G19 — 不含金鑰**：`IN_PROGRESS` 的廣播只傳遞「開考」這個事實。桌面版收到後**必須**另行呼叫 `POST /user/exam/key`。

### `exam-reset`（新增）

```
payload → { resetAt: string, reason?: string }
```

**G20 — 獨立事件**：不與 `exam-message` 共用。桌面版收到後執行 `data-model.md` §8 的完整清除。

**G21 — 不寫入訊息表**：reset 的第一個動作即清空 `Message`，寫入後立即清除無意義。

---

## 8. 離線佈署檔

```
{
  "meta":   ExamConfigMeta,
  "cipher": { "iv": string, "ciphertext": string, "tag": string }
}
```

**G22 — 與線上同形**：桌面版對離線佈署檔與 `POST /user/exam/config` 的回應共用同一套解析與驗證。

**G23 — 不含金鑰或口令**：檔案外流不得洩漏測資。

**G24 — 取代明文上傳**：現行接受完整明文考卷的載入路徑必須移除。

---

## 9. 跨端契約 fixture

config schema 在本專案共有**三份**獨立定義：

| 定義 | 檔案 | 形式 |
|---|---|---|
| 後端 | `host/backend/src/schemas/config.schema.ts` | zod `^3` |
| 學生端 | `desktop/src/main/schemas/examConfig.schema.ts` | zod `^4` |
| 管理端 | `host/frontend/src/types/config.ts` | TypeScript type |

三者各自持有一份**逐位元組相同**的 fixture：

```
host/backend/test/fixtures/exam-config-payload.fixture.json
desktop/test/fixtures/exam-config-payload.fixture.json
host/frontend/test/fixtures/exam-config-payload.fixture.json
```

**G25 — 三向驗證**：三端各有測試以該 fixture 驗證自身定義。任一端修改契約而未同步其餘兩份，其他端的測試失敗。

**G26 — 涵蓋範圍**：fixture 必須同時包含 `meta`、`cipher` 封包與 `wrappedExamKey` 三種結構的完整樣本，含選填欄位存在與缺席兩種情形。

> 這不是理論風險。`host/frontend/src/types/config.ts` 內留有一段註解，記錄 feature 004 新增 `judgerSettings` 欄位後，該型別描述了舊 schema 一段時間而無人察覺 —— 「nothing binds this type to the backend's」。本 fixture 即為那個缺口的補救。
>
> 三端的驗證方式不同：後端與學生端可直接 parse，管理端是 TypeScript type 而非 runtime schema，需以型別層斷言（`satisfies` 或編譯期檢查）驗證 fixture 可指派為 `ExamConfig`。

## 10. 加密參數

| 用途 | 演算法 | 參數 |
|---|---|---|
| 傳輸層（既有） | AES-256-GCM | 12-byte IV，裝置 AES 金鑰 |
| 考卷內容 | AES-256-GCM | 12-byte IV，`K_exam` |
| 口令包裝 | PBKDF2-HMAC-SHA256 → AES-256-GCM | 600,000 迭代，16-byte salt，32-byte 輸出 |

**G27 — 兩條路徑同一把金鑰**：`POST /user/exam/key` 回傳的 `K_exam`，與 `AES-GCM-decrypt(wrappedExamKey, PBKDF2(口令, salt))` 的結果**必須逐位元組相同**。此為可自動測試的斷言。

**G28 — 認證失敗即錯誤**：GCM 認證失敗必須拋出錯誤，不得回退為空考卷或部分考卷。
