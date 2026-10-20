# Data Model: 管理端 SQLite 備份

本功能不新增持久資料表。備份檔案是一次請求的暫時性產物，正式資料庫仍是唯一資料來源。

## 目前資料庫（Source Database）

| 欄位 | 意義 | 規則 |
|------|------|------|
| resolvedStorage | 實際資料庫位置 | 與 Sequelize 使用的 `DB_STORAGE` 解析結果相同；正式環境為檔案 |
| availability | 是否存在且可讀 | 不存在或無法讀取時不得建立空白來源檔 |
| committed content | 已提交的考試資料及結構 | 備份代表單一一致時點；不得改動來源 |

## 備份作業（Backup Operation）

此實體只存在於一次請求的生命週期，不寫入資料庫。

| 欄位 | 意義 | 規則 |
|------|------|------|
| requestId | 作業識別 | 每次請求唯一；僅用於內部追蹤，不放入下載內容 |
| startedAt | 啟動時間 | 用於等待期限與日誌 |
| state | `waiting`、`copying`、`validating`、`streaming`、`completed`、`failed`、`cancelled` | 只有 `validating` 通過才能進入 `streaming` |
| source | 目前資料庫 | 唯讀使用 |
| artifact | 備份檔案 | 一對一；失敗或結束時清理 |

### 狀態轉移

`waiting → copying → validating → streaming → completed`。在 `waiting`、`copying` 或 `validating` 可轉為 `failed` 或 `cancelled`；在 `streaming` 發生傳送錯誤或斷線時轉為 `failed` 或 `cancelled`，並終止傳送。所有終結狀態都必須執行資源清理。

## 備份檔案（Backup Artifact）

| 欄位 | 意義 | 規則 |
|------|------|------|
| privatePath | 程序私有暫存路徑 | 每次請求唯一，不在公開靜態目錄，不回傳路徑 |
| downloadName | 用戶端顯示檔名 | 固定前綴、UTC 時間與 `.sqlite` 副檔名，不含使用者輸入 |
| byteLength | 檔案大小 | 完成複製後讀取，必須大於零 |
| integrity | SQLite 完整性檢查結果 | `ok` 才可傳送 |

### 驗證規則

- 來源必須是目前正式資料庫；備份不得把暫存檔當來源。
- 目的路徑每次唯一，且在作業開始前不存在。
- 未完成、未通過完整性檢查或已取消的檔案不能進入成功回應。
- 備份包含 WAL 中已提交的內容，輸出是一個可獨立開啟的 SQLite 檔案。
- 任何終結狀態都不可留下可供後續請求存取的暫存備份。
- 同時備份名額在暫存檔清理完成後釋放，避免慢速下載累積過多敏感副本。
