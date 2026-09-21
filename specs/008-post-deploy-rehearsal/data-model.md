# Phase 1 Data Model: Post-Deployment Rehearsal

**Feature**: 008-post-deploy-rehearsal ｜ **Date**: 2026-09-21

所有型別以 zod schema 為單一來源，型別由 `z.infer` 推導（`backend/src/schemas/rehearsal.schema.ts` → `backend/src/types/rehearsal.type.ts`）。讀寫兩端皆 parse，與 `deploy-test.schema.ts` 同形。

---

## 1. RehearsalRun

一次部署後測試的完整紀錄。**只保留最近一次**，存於 `SystemSettings`（key `post_deploy_rehearsal_latest`）。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | `string` (uuid) | 演練識別 |
| `state` | `RehearsalState` | 見 §3 |
| `overallOutcome` | `"passed" \| "failed" \| "interrupted"` ? | 終態才有 |
| `stages` | `RehearsalStage[]` | 六段，順序固定（見 §2） |
| `currentStage` | `RehearsalStageId` ? | 進行中時指向正在跑的那一段 |
| `ownsSystemState` | `boolean` | **在第一次變更系統之前即為 `true`**。重啟復原據此判定殘留資料屬於演練（research.md D6） |
| `cleanupCompleted` | `boolean` | 清除是否確實完成。`false` + 終態 = FR-015 的警示狀態 |
| `cleanupError` | `string` ? | 清除失敗的原因，已截斷 |
| `interruptionReason` | `"deadline_exceeded" \| "process_restart"` ? | |
| `startedAt` / `finishedAt` | `number` / `number`? | epoch ms |
| `deadlineMs` | `number` | 整場上限，預設 300000 |
| `errors` | `string[]` | 不屬於任一段落的錯誤，已截斷 |

**不變式**
- `stages` 長度恆為 6，`id` 依 §2 的順序且不重複。
- `ownsSystemState` 一旦為 `true` 不再變回 `false`；它只在 `cleanupCompleted` 轉為 `true` 時失去效力。
- 終態 run 必有 `overallOutcome` 與 `finishedAt`。
- `overallOutcome === "passed"` ⟹ 六段皆 `passed` **且** `cleanupCompleted === true`。

---

## 2. RehearsalStage

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | `RehearsalStageId` | `"paper" \| "enrol" \| "admit" \| "submit" \| "grade" \| "cleanup"` |
| `status` | `"pending" \| "running" \| "passed" \| "failed" \| "skipped"` | `skipped` = 前面某段已失敗 |
| `startedAt` / `finishedAt` | `number`? | |
| `durationMs` | `number`? | |
| `timeoutMs` | `number` | 該段上限（research.md D8） |
| `checks` | `RehearsalCheck[]` | 該段內的個別驗證項 |
| `failureReason` | `string`? | 已截斷 |

### 各段的 checks

| 段落 | checks | 對應需求 |
|---|---|---|
| `paper` | `config_uploaded`、`database_initialized`、`phase_is_initialized` | FR-005, FR-006 |
| `enrol` | `device_registered`、`paper_meta_received`、`paper_cipher_received`、`environment_reported`、**`exam_key_refused_before_start`** | FR-007, **FR-008** |
| `admit` | `phase_is_setup_finished`、`student_logged_in`、`session_token_issued` | FR-006, FR-007 |
| `submit` | `phase_is_in_progress`、`exam_key_released`、`cipher_decrypted`、`submission_ac_accepted`、`submission_wa_accepted` | FR-007, FR-009 |
| `grade` | `judge_accepted`、`judge_finished`、`verdict_ac_matches`、`verdict_wa_matches`、`no_system_attribution` | FR-010, **FR-011**, FR-012 |
| `cleanup` | `phase_is_uninitialized`、`users_zero`、`submissions_zero`、`devices_zero`、`config_absent` | FR-013, FR-014 |

`exam_key_refused_before_start` 是**反向檢查**：預期收到 `409 phase_not_allowed`。收到 200 才是失敗。

---

## 3. RehearsalCheck

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | `string` | 上表的檢查名 |
| `status` | `"passed" \| "failed" \| "skipped"` | |
| `expected` | `string` | 人類可讀的預期，例如 `"409 phase_not_allowed"` |
| `observed` | `string`? | 實際觀察，已截斷（FR-020） |
| `attribution` | `"submission" \| "system"` ? | 僅評測相關的 check 有值。`system` 一律使該 check 失敗（FR-011） |

---

## 4. 狀態轉移

```
queued ──► running ──► completed        （六段跑完，清除成功或失敗都到這裡）
              │
              ├──────► interrupted      （整場 deadline 逾時，或重啟復原）
              │
              └──────► failed           （編排本身丟出例外）
```

終態集合：`{ completed, interrupted, failed }`。`isTerminalRehearsalState()` 與 deploy-test 的同名判定同形。

**注意**：段落失敗**不會**讓 `state` 變成 `failed`。段落失敗的演練仍然 `completed`，只是 `overallOutcome === "failed"` —— 因為它有走完（含清除），報告是完整的。`state: "failed"` 保留給「編排自己壞了」這種沒有可信報告的情形。

---

## 5. RehearsalExamPaper（演練考卷）

不是可變資料，而是 `backend/src/config/rehearsal-paper.config.ts` 中的**常數**，型別為 production 的 `ExamConfig`，模組載入時即 `examConfigSchema.parse()`。

| 結構 | 值 |
|---|---|
| `accessibleUsers` | 1 位：`{ id, name }`，**無 `ip`**（research.md D3） |
| `sections` | 1 節，2 題（`rehearsal-ac`、`rehearsal-wa`），C 語言 |
| 每題 `subtasks` | 1 個，含 1–2 筆 `visible` 測資，確定性輸入輸出 |
| `environmentVariables.startPassword` | 非空字串（schema 強制） |
| `judgerSettings` | 明確的 `timeLimit` / `memoryLimit`；**不覆寫 `maxConcurrentJobs`** |

與之配對的兩份提交程式碼同樣是常數：一份必然 AC、一份必然 WA。

---

## 6. 與既有實體的關係

演練**不新增任何資料表**。它在執行期間建立的，全部是既有實體的一般資料列：

```
RehearsalRun ──(ownsSystemState)──► 暫時存在的既有資料
                                      ├── SystemSettings: exam_config / exam_key / meta / cipher
                                      ├── User × 1、ScoreBoard × 1
                                      ├── DeviceKeyMap × 1
                                      ├── Submission × 2
                                      └── UserActionLog / Message（由既有流程順帶產生）
                                            │
                                            └──► 全部由 InitService.wipeAllData() 清除
```

`RehearsalRun` 自己存在 `SystemSettings`，而 `wipeAllData()` 只 purge 三個具名 key，因此報告倖存（research.md D5）。

---

## 7. 驗證規則摘要

| 規則 | 強制點 |
|---|---|
| 啟動前 `ExamState === UNINITIALIZED` | `RehearsalService.start` |
| 啟動前無 exam config、`User.count() === 0` | `RehearsalService.start`（FR-002、US5） |
| 啟動需 `acknowledgeWipe === true` | 啟動 schema（FR-003） |
| 上一次演練若 `cleanupCompleted === false` 則拒絕啟動 | `RehearsalService.start`（research.md D6） |
| 同時只有一個演練 | 非終態 run 存在則回 `alreadyRunning`（FR-004） |
| 與部署測試互斥 | `JudgingWorkCoordinator.acquireRehearsal()`（FR-004、research.md D4） |
| 所有外部輸出截斷 | `truncateJudgerOutput`（FR-020、NFR-SEC） |
