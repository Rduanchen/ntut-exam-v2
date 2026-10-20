# Implementation Plan: 下載 SQLite 資料庫備份

**Branch**: `feat/009-download-sqlite-backup` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-download-sqlite-backup/spec.md`

## Summary

新增 `GET /admin/backup`，沿用管理端驗證。後端以現有 `sqlite3` 套件的線上備份介面，從目前資料庫建立單次請求專用的一致快照；完成與檢查後，以附件形式傳送 SQLite 檔案。控制同時備份數量、限制等待時間，並在傳送完成、失敗或斷線後清除暫存內容。

## Technical Context

**Language/Version**: TypeScript 5.9.3，Node.js >=20.19.0

**Primary Dependencies**: Express 4.22.3、Sequelize 6.37.8、`sequelize-typescript` 2.1.6、`sqlite3` 5.1.7；不新增正式環境套件

**Storage**: 既有 SQLite 資料庫（`DB_STORAGE` 或 `backend/database.sqlite`）；每次請求使用私有暫存目錄存放快照，完成後刪除

**Testing**: Vitest 4.1.12、Supertest 7.3.1、`tsc -p tsconfig.test.json`；檔案型 SQLite 整合測試加上既有管理路由測試

**Target Platform**: Node.js 後端於考場部署的主機；檔案型 SQLite 為正式環境

**Project Type**: Express API 後端；本功能不變更前端或桌面端

**Performance Goals**: 100 MB 以下資料庫的授權下載 p95 在 30 秒內開始；兩個同時備份請求與考試寫入並行時仍能完成且保持資料一致

**Constraints**: 不停止或修改正式考試資料；不直接複製 SQLite 主檔；備份完成及完整性檢查前不得送出成功回應；不得留公開可取的暫存備份

**Scale/Scope**: 一個下載端點、單一目前資料庫、單次按需快照；不含排程、歷史備份與還原

## Constitution Check

*GATE: Phase 0 前評估，Phase 1 後複核；以下均通過。*

- [x] **Type Safety**: 備份介面由窄型別封裝缺失的 `sqlite3` 宣告；端點與錯誤資料維持型別檢查。
- [x] **Async & Concurrency**: 分批異步複製，限制同時備份數與等待時間；不讓單次備份長時間持有來源鎖。
- [x] **Security & Stability**: 路由置於既有驗證之後；暫存目錄僅本機程序可讀；完整性檢查、失敗清理及敏感資訊遮蔽已納入設計。
- [x] **Low Coupling**: 路由、控制器、備份服務各司其職；資料庫連線細節由服務封裝。
- [x] **Testability**: 路由驗證、備份服務、檔案完整性、WAL、失敗與競態均有可執行測試界面。

### 設計後複核

研究及介面設計未增加憲法例外。正式資料庫備份採獨立唯讀連線；測試用記憶體資料庫無法由新連線開啟，測試將以檔案型 fixture 驗證實際備份，並以既有測試環境驗證管理端路由。嚴格型別與 100% 新增程式碼覆蓋仍是實作階段的驗收門檻。

## Project Structure

### Documentation (this feature)

```text
specs/009-download-sqlite-backup/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── admin-backup-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/database.config.ts
│   ├── routes/admin/index.ts
│   ├── routes/admin/admin-backup.route.ts
│   ├── controllers/admin/admin-backup.controller.ts
│   ├── services/database-backup.service.ts
│   └── types/sqlite-backup.type.ts
└── test/
    ├── integration/routes/admin-backup.test.ts
    └── unit/services/database-backup.service.test.ts
```

**Structure Decision**: 沿用既有後端 `routes/admin` → `controllers/admin` → `services` 分層。檔名為規劃落點；實作可在不改變職責的前提下調整。檔案型 fixture 測試不動正式 `backend/database.sqlite`。

## Complexity Tracking

無憲法例外。
