# Contract: Rehearsal Admin API

**Feature**: 008-post-deploy-rehearsal

掛載點：`/admin/rehearsal`，位於 `adminRouter.use(verifyAdminToken)` 之下 —— 四個端點全部需要管理權限（NFR-SEC、FR-001、US5 場景 4）。

---

## `GET /admin/rehearsal/profile`

回報現在能不能啟動演練，以及為什麼不能。管理端據此決定按鈕是否可按。

**200**
```json
{
  "canStart": false,
  "blockedReason": "exam_initialized",
  "deadlineMs": 300000,
  "stages": [
    { "id": "paper",   "title": "考卷載入與初始化", "timeoutMs": 15000 },
    { "id": "enrol",   "title": "模擬裝置入場",     "timeoutMs": 20000 },
    { "id": "admit",   "title": "模擬學生登入",     "timeoutMs": 15000 },
    { "id": "submit",  "title": "模擬學生提交",     "timeoutMs": 20000 },
    { "id": "grade",   "title": "助教手動評測",     "timeoutMs": 180000 },
    { "id": "cleanup", "title": "清除",             "timeoutMs": 30000 }
  ],
  "pendingCleanup": false
}
```

`blockedReason` ∈
| 值 | 意義 |
|---|---|
| `exam_initialized` | 階段不是 `UNINITIALIZED` |
| `exam_data_present` | 已有考卷或學生資料 |
| `rehearsal_active` | 已有演練進行中 |
| `deploy_test_active` / `deploy_test_draining` | feature 006 的部署測試佔用評測引擎 |
| `student_judging_active` | 有學生評測進行中 |
| `cleanup_pending` | 上一次演練未清乾淨，須助教手動處理（FR-015） |

`canStart: true` 時 `blockedReason` 不存在。

---

## `POST /admin/rehearsal`

啟動演練。立即回應，演練在背景執行。

**Request**
```json
{ "acknowledgeWipe": true }
```

`acknowledgeWipe` 必須為 `true`（FR-003）。缺少或為 `false` → `400`。這是刻意的：破壞性後果必須被明示，不能靠 UI 自律。

**202 Accepted** — 已受理
```json
{ "run": { "...": "RehearsalRun，state 為 queued" } }
```

**200 OK** — 已有演練進行中，回傳既有的那一個（冪等，助教連按兩下不該是錯誤）
```json
{ "run": { "...": "..." }, "alreadyRunning": true }
```

**400** `{ "error": "acknowledge_required" }`
**409** `{ "error": "<blockedReason>", "reason": "<blockedReason>" }` — 前置條件不成立。**此時系統無任何變更**（US5 場景 1）。
**401** — 無管理權限。

---

## `GET /admin/rehearsal/latest`

最近一次演練，無論進行中或已結束。清除之後依然可讀（FR-019、SC-006）。

**200**
```json
{ "run": { "...": "RehearsalRun" } }
```
從未跑過演練時 `{ "run": null }`。

---

## `GET /admin/rehearsal/:runId`

指定演練。只保留最近一次，因此不相符即 `404`。

**200** `{ "run": { "...": "..." } }`
**404** `{ "error": "Not Found: unknown rehearsal" }`

---

## 錯誤語意

| 狀況 | 回應 |
|---|---|
| 前置條件不成立 | `409` + `reason`，**不動任何資料** |
| 缺少確認 | `400 acknowledge_required` |
| 演練進行中重複啟動 | `200` + `alreadyRunning: true`（非錯誤） |
| 演練內部段落失敗 | 仍是成功的 HTTP 回應；失敗表現在 `run.overallOutcome` |

最後一列是本契約最重要的一條：**演練失敗不是 API 失敗**。演練的工作是產生一份報告，產出報告即為成功。
