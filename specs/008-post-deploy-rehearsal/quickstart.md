# Quickstart: Validate the Post-Deployment Rehearsal

本檔驗證 feature 008 實作完成後是否真的可用。自動化測試證明編排與契約；§C 是**對真實部署的 oracle** —— 沒有跑過 §C，這個功能不能算交付，因為它的全部價值就在於對真實部署說話。

實作須符合 [rehearsal-admin-api.md](contracts/rehearsal-admin-api.md)、[rehearsal-flow.md](contracts/rehearsal-flow.md) 與 [data-model.md](data-model.md)。

## Prerequisites

- Node.js 符合 `backend/package.json`（`>=20.19.0`），相依已以 pnpm 安裝。
- Docker Compose 已啟動，Piston 具備 **C** runtime（演練考卷只用 C）。
- `ADMIN_TOKEN` 已設定，且後端 process 讀得到。
- **`LOAD_TEST_MODE` 必須未設定或為 `false`。** 設了 `pure` / `simulation` / `true` 會讓加密驗證與 IP 檢查被繞過，演練就會對一條考試當天不存在的路徑蓋章（research.md D2）。
- 系統處於 `UNINITIALIZED`、無考卷、無學生 —— 否則演練會（也應該）被拒絕。

---

## A. 靜態與自動化驗證

從 repo 根目錄：

```bash
pnpm --filter backend run lint
pnpm --filter backend run test          # tsc -p tsconfig.test.json && vitest run
pnpm --filter backend run build
pnpm --filter frontend run test
pnpm --filter frontend run build
```

必須全數綠燈。特別確認：

1. **`rehearsal-paper.config.ts` 通過 `tsc`。** 它以 production 的 `ExamConfig` 標註，考卷 schema 若演進而 fixture 未跟上，這裡會編譯失敗 —— 這是 experience.md #4 唯一有效的防腐劑，不要用 `as` 或 `any` 把它關掉。
2. **一般測試不需要 Piston 也不需要監聽中的 server。** `rehearsal.service` 的 `http` 依賴可注入，段落邏輯以替身測試。
3. `judging-work-coordinator` 的測試涵蓋新的 rehearsal lease：rehearsal 擋 deploy、deploy 擋 rehearsal、rehearsal **不**擋 student（research.md D4）。

---

## B. 契約走查（integration，不需真實 Piston）

以 supertest 對真實 app 跑，確認契約行為：

| 驗證 | 預期 | 對應 |
|---|---|---|
| 無管理憑證呼叫四個端點 | 全部 `401` | US5 場景 4 |
| `POST /admin/rehearsal` 不帶 `acknowledgeWipe` | `400 acknowledge_required`，系統無變更 | FR-003 |
| 系統已初始化時啟動 | `409 exam_initialized`，**考卷與資料 0 筆變更** | US5 場景 1、SC-005 |
| 演練進行中再次啟動 | `200` + `alreadyRunning: true`，不產生第二個 run | FR-004 |
| feature 006 部署測試進行中啟動演練 | `409 deploy_test_active` | Edge Case |
| 演練進行中啟動部署測試 | `409 rehearsal_active` | Edge Case |
| `GET /admin/rehearsal/latest` 在清除之後 | 報告完整可讀 | FR-019、SC-006 |
| 持久化 run 為非終態時呼叫 startup service | 標記 `interrupted / process_restart` 且完成清除 | FR-016、US4 場景 5 |

---

## C. 對真實部署的走查（oracle — 必做）

### C-1 成功路徑

1. 確認系統為 `UNINITIALIZED` 且無資料。
2. 管理端開啟 Judge 頁 → 部署後測試面板 → 應顯示可啟動。
3. 按下啟動，**確認對話框必須明確說出「會清空系統」**，確認後開始。
4. 停在該頁觀察：六段依序由 `pending` → `running` → `passed`（FR-017、US1 場景 2）。
5. **中途重新整理瀏覽器**，進度必須回來（US6 場景 1）。
6. 結束後確認：
   - `overallOutcome === "passed"`，全部六段通過。
   - 逐段耗時與整體耗時可見，總時間 **< 5 分鐘**（SC-001）。
   - 特別檢查 `enrol` 段的 `exam_key_refused_before_start` 為通過 —— 它是測資保護仍然生效的唯一證據。
7. 確認系統回到 `UNINITIALIZED`，考卷、學生、裝置、提交、分數全部為 0（SC-004）。
8. **接著上傳一份真正的考卷並初始化**，確認流程正常、且看不到任何演練資料（US4 場景 4）。

### C-2 失敗路徑（刻意破壞，SC-003）

逐一製造下列故障，每次確認演練判定為**失敗**、指出的段落與實際破壞的段落**一致**，且**系統仍然被清乾淨**：

| 破壞 | 預期失敗段落 |
|---|---|
| 停掉 Piston 容器 | `grade` |
| 讓評測回傳系統歸因的失敗（例如把 `compileTimeout` 壓到極小） | `grade`，`no_system_attribution` 失敗 |
| 暫時讓 `/user/exam/key` 在 `INITIALIZED` 也回 200 | `enrol`，`exam_key_refused_before_start` 失敗 |
| 讓 `/user/submissions/code` 回 500 | `submit` |

每一次都回頭確認 §C-1 第 7 步 —— **失敗的演練同樣必須清乾淨**（US4 場景 2）。

### C-3 誤觸防線（SC-005）

1. 上傳一份真正的考卷並初始化。
2. 嘗試啟動演練。
3. 確認被拒絕，**且考卷與所有資料完全不變**。這一條若不成立，整個功能是淨負值 —— 它預防的損害遠小於它造成的。

### C-4 中斷復原

1. 啟動演練，在 `submit` 段進行中**強制重啟後端**。
2. 確認重啟後：系統回到 `UNINITIALIZED`、資料歸零、報告標記為 `interrupted / process_restart`。
3. 確認可以立刻再啟動一次新的演練。

---

## 收尾條件

1. §A 全數綠燈，且新增檔案達到憲法的覆蓋率標準。
2. §B 全表通過。
3. §C-1 至 §C-4 在一台真實部署機器上各走過一次。
4. 演練在 `LOAD_TEST_MODE` 未設定的情況下通過（若只在 `pure` 下通過，等於沒有驗證）。
