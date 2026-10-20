# Contract: 管理端資料庫備份下載

## `GET /admin/backup`

**用途**：建立目前 SQLite 資料庫的一致快照，完成後立即下載。

**驗證**：沿用現有 `/admin` 路由的 `verifyAdminToken`；支援既有 `Authorization: Bearer <token>` 或 `x-admin-token: <token>`。不接受匿名請求。不需要 request body、路徑參數或查詢參數。

備份包含完整考試資料。部署環境必須明確設定 `ADMIN_TOKEN`，且不可使用已知預設值 `admin` 或 `admin-secret`；否則即使請求帶有該憑證，也不得下載備份。

### 成功回應

| 項目 | 值 |
|------|----|
| 狀態 | `200 OK` |
| `Content-Type` | `application/vnd.sqlite3` |
| `Content-Disposition` | `attachment; filename="exam-backup-YYYYMMDDTHHMMSSZ.sqlite"`（UTC；同秒請求可另加唯一後綴） |
| `Cache-Control` | `no-store` |
| 本文 | 原始 SQLite 資料庫位元組，為單一可獨立開啟的檔案；非 JSON、ZIP 或檔案路徑 |

備份與完整性檢查完成後才發出成功標頭。`Content-Length` 可在已知大小時提供。多個同時請求各自取得獨立快照，檔名可相同但暫存來源不得共用。

### 失敗回應

| 狀態 | 條件 | 本文 |
|------|------|------|
| `401 Unauthorized` | 缺少或無效管理端憑證 | 既有管理端錯誤 JSON；不含資料庫位元組 |
| `503 Service Unavailable` | 管理憑證未安全設定、來源資料庫不可用、備份資源暫時不足或等待逾時 | `{ "error": "Database backup temporarily unavailable", "code": "BACKUP_UNAVAILABLE" }` |
| `500 Internal Server Error` | 非暫時性備份建立或驗證失敗 | `{ "error": "Database backup failed", "code": "BACKUP_FAILED" }` |

失敗本文不得含管理憑證、伺服器路徑、SQL 字串或資料庫內容。失敗回應不得帶有附件標頭。若檔案傳送已開始後發生斷線或讀取錯誤，伺服器終止連線並清理暫存；此時無法再改送 JSON，呼叫端須以傳輸失敗或長度不符判定下載失敗。

### 相容性與限制

- 此端點不寫入正式資料庫，也不提供還原操作。
- 回應可能包含考卷與個資；呼叫端應把下載檔視為敏感資料。
- 由於備份需要建立完整快照，請求可能在開始傳送前等待；呼叫端的逾時設定應高於部署環境測得的備份時間。
