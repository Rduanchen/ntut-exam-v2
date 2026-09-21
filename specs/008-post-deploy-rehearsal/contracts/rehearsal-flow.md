# Contract: Rehearsal Internal Flow

**Feature**: 008-post-deploy-rehearsal

演練在背景對**自己**發出的請求序列。全部走 loopback HTTP（research.md D1）；學生步驟不帶管理憑證，助教步驟帶 `ADMIN_TOKEN`。

`BASE = http://127.0.0.1:${process.env.PORT || 3000}`

---

## 段落 1 — `paper`：考卷載入與初始化

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `POST /admin/config`　body = 演練考卷 | 200 | `config_uploaded` |
| 2 | `POST /admin/init` | 200 | `database_initialized` |
| 3 | `GET /admin/exam-state` | 200，`state === "INITIALIZED"` | `phase_is_initialized` |

`POST /admin/init` 內部即呼叫 `ExamStateService.changeState(INITIALIZED)`，因此不需要額外的推進請求。

> **順序要求**：`RehearsalRun`（`ownsSystemState: true`）必須在 #1 之前寫入。這條順序是重啟復原敢做破壞性清除的全部依據（research.md D6）。

---

## 段落 2 — `enrol`：模擬裝置入場

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `GET /user/auth/rsa-public-key` | 200，PEM | — |
| 2 | 本機產生 AES-256 金鑰；RSA-OAEP/SHA-256 包裝 | — | — |
| 3 | `POST /user/auth/register-device` | 200 | `device_registered` |
| 4 | `POST /user/exam/config`（裝置金鑰加密） | 200，含 meta 與 cipher | `paper_meta_received`、`paper_cipher_received` |
| 5 | `POST /user/exam/environment-report` | 200 | `environment_reported` |
| 6 | **`POST /user/exam/key`** | **409 `phase_not_allowed`** | `exam_key_refused_before_start` |

**#6 是反向檢查**（FR-008）。此時階段為 `INITIALIZED`，`exam-phase.middleware` 的矩陣把 `/exam/key` 限縮在 `IN_PROGRESS`。**收到 200 才是失敗** —— 那代表測資保護已經破了，而這正是 feature 007 存在的理由。

---

## 段落 3 — `admit`：模擬學生登入

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `POST /admin/exam-state`　body = `{ state: "SETUP_FINISHED" }` | 200 | `phase_is_setup_finished` |
| 2 | `POST /user/auth/login`（AES-GCM 包 `{ testId }`） | 200，回 `session_token` | `student_logged_in`、`session_token_issued` |

登入之所以能過，是因為演練考卷的名單項不帶 IP，`AuthService` 的 IP 比對整段跳過（research.md D3）。**演練不為此修改任何 production 程式碼。**

---

## 段落 4 — `submit`：模擬學生提交

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `POST /admin/exam-state`　body = `{ state: "IN_PROGRESS" }` | 200 | `phase_is_in_progress` |
| 2 | `POST /user/exam/key` | 200，回 `K_exam` | `exam_key_released` |
| 3 | 以 `K_exam` 解密 cipher，比對題目 id 與 meta 一致 | — | `cipher_decrypted` |
| 4 | `POST /user/submissions/code`（題 `rehearsal-ac`，正確程式） | 200 | `submission_ac_accepted` |
| 5 | `POST /user/submissions/code`（題 `rehearsal-wa`，錯誤程式） | 200 | `submission_wa_accepted` |

#2 與段落 2 的 #6 是同一個端點，唯一的差別是階段。兩者一起，構成「測資在開考前不可讀、開考後可讀」的端對端證明。

#4、#5 的 body 必須帶新的 `nonce` 與 `timestamp` —— `ReplayProtectionService` 會擋重放，而這正是要驗證的東西之一。

---

## 段落 5 — `grade`：助教手動評測

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `POST /admin/judger/judge/:testId` | **202**，回 `jobId` | `judge_accepted` |
| 2 | 輪詢 `GET /admin/judger/jobs/:jobId` 直到 `state` 為 `finished`／`failed` 或逾時 | `finished`，`outcome.systemFailures === 0` | `judge_finished`、`no_system_attribution` |
| 3 | `GET /admin/scores`（或該生的成績單端點） | `rehearsal-ac` 滿分、`rehearsal-wa` 零分 | `verdict_ac_matches`、`verdict_wa_matches` |

**`outcome.systemFailures > 0` 一律使本段失敗**（FR-011）。它代表評測引擎把自己的問題記到了提交頭上 —— experience.md #6 的那條血債。此時**不得**因為「WA 那份確實沒過」就宣告 `verdict_wa_matches` 通過：分不清學生的錯與系統的錯，等於沒有驗證。

#1 能拿到 202 而不是 409，靠的是 `JudgingWorkCoordinator` 的 rehearsal lease 不擋 `acquireStudent()`（research.md D4）。

---

## 段落 6 — `cleanup`：清除

| # | 請求 | 預期 | check |
|---|---|---|---|
| 1 | `POST /admin/init/reset` | 200 | — |
| 2 | `GET /admin/exam-state` | `state === "UNINITIALIZED"` | `phase_is_uninitialized` |
| 3 | `GET /admin/init/init-status` | `hasConfig === false`、`initializedUserCount === 0` | `config_absent`、`users_zero` |
| 4 | `GET /admin/connection/devices` | 空 | `devices_zero` |
| 5 | `GET /admin/submissions/students` | 空 | `submissions_zero` |

`POST /admin/init/reset` → `InitService.wipeAllData()`，即既有的全域 reset。**不另造第二套清除工序。**

清除成功後 `cleanupCompleted: true`。任一步失敗 → `cleanupCompleted: false` + `cleanupError`，`overallOutcome: "failed"`，管理端顯示 FR-015 的警示，且後續啟動一律回 `409 cleanup_pending`。

**段落 6 永遠會被嘗試**，即使段落 1–5 任一失敗或逾時（US4 場景 2）。唯一的例外是段落 1 的第一個請求就失敗 —— 此時系統未被變更，無可清除，該段記為 `skipped`。

---

## 不變式

1. **不繞過。** 每一個請求都經過它在 production 中會經過的全部中介層。演練沒有專屬端點、沒有 `isRehearsal` 旗標、沒有被略過的檢查。
2. **反向檢查與正向檢查同等重要。** `exam_key_refused_before_start` 失敗的嚴重性高於任何一項正向檢查 —— 它代表測資保護失效。
3. **系統歸因一律失敗。** 任何歸因為 SYSTEM 的結果都不得被計為成功驗證（FR-011）。
4. **清除必須收斂。** 清除從任一中間階段出發都要能回到 `UNINITIALIZED`，不依賴演練走完。
