# Quickstart: 驗證管理端資料庫備份

本文件供功能實作後驗收使用；介面細節見 [contracts/admin-backup-api.md](contracts/admin-backup-api.md)，資料與清理規則見 [data-model.md](data-model.md)。請在測試環境使用測試資料，勿把備份檔提交到版本庫。

## 前置條件

- 已安裝專案相依套件，且可執行 `pnpm`、`curl`、`sqlite3`。
- 後端已使用檔案型 SQLite 資料庫啟動，可透過 `http://127.0.0.1:3000` 連線。
- 已明確設定非預設值的 `ADMIN_TOKEN`（不得為 `admin` 或 `admin-secret`），資料庫至少有一筆可辨識的測試資料。
- 有足夠可用磁碟空間供暫時備份檔使用。

## 自動驗證

在 repo 根目錄執行：

```sh
pnpm --filter backend test
pnpm --filter backend test:coverage
pnpm --filter backend build
pnpm --filter backend lint
```

預期：測試碼型別檢查、Vitest 與正式程式碼編譯皆成功。新增測試須涵蓋管理端驗證、可開啟的備份檔、WAL 已提交資料、寫入與備份並行、同時下載、失敗後重試、取消下載及暫存清理。覆蓋率門檻依專案憲法執行。

## 手動端到端驗收

使用安全位置儲存臨時下載；以下命令中的 `ADMIN_TOKEN` 需先在目前 shell 設為測試環境的管理端憑證。

```sh
backup_check_dir=$(mktemp -d)
curl --fail-with-body --show-error \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -D "$backup_check_dir/headers.txt" \
  -o "$backup_check_dir/exam-backup.sqlite" \
  http://127.0.0.1:3000/admin/backup
sqlite3 "$backup_check_dir/exam-backup.sqlite" 'PRAGMA integrity_check;'
sqlite3 "$backup_check_dir/exam-backup.sqlite" '.tables'
```

預期：回應狀態為 200，標頭含附件檔名與 `Cache-Control: no-store`；`integrity_check` 輸出 `ok`，資料表及驗收用已提交資料存在。再查詢一筆已知測試資料，確認內容正確。驗收完畢後刪除 `$backup_check_dir` 及其下載檔。

## 權限與故障情境

```sh
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:3000/admin/backup
```

預期：輸出 `401`，不產生下載檔。再用錯誤憑證重試，同樣應為 `401`。在測試環境暫時使來源資料庫不可用時，應取得合約定義的錯誤 JSON，且沒有附件標頭；恢復後重試應成功。備份過程同時提交與評分的完整驗收，須在考場測試機上檢查請求延遲及資料一致性，並確認 100 MB 以下資料庫的下載開始時間達到規格目標。

實作後確認的契約：成功回應是 `200`、`application/vnd.sqlite3`、附件檔名與 `Cache-Control: no-store`；缺少或錯誤管理端憑證為 `401`；來源不可用或資源忙碌為 `503` 並帶 `BACKUP_UNAVAILABLE`；其他備份建立或驗證失敗為 `500` 並帶 `BACKUP_FAILED`。後端使用檔案型 `DB_STORAGE`；`:memory:` 只用於既有測試，不可作為下載備份來源。

## 本機隔離驗收紀錄（2026-10-20）

以編譯後的 `createApp()` 啟動本機 HTTP 服務，指定暫存的檔案型 `DB_STORAGE`，建立約 80 MB 的測試資料庫並啟用 WAL。結果如下：

| 情境 | 結果 |
|------|------|
| 無管理端憑證 | `401` |
| 兩位管理員同時下載，期間對來源連續提交 20 次寫入 | 兩份檔案各為 80,084,992 bytes，`PRAGMA integrity_check` 均為 `ok`，均包含 21 筆資料；來源最後也是 21 筆 |
| 10 次下載開始時間抽樣 | 首位元組 p95 為 0.101 秒，最大 0.102 秒 |

此紀錄只代表目前開發機的隔離 HTTP 與 SQLite 測試；尚未在正式考場硬體、真實學生提交與助教評分 API 負載下測量 100 MB 目標。考場部署前仍需完成上述現場驗收。

並行名額延續到檔案傳送完畢的修正後，另以相同大小的資料庫重跑兩份同時下載及 10 次開始時間抽樣：兩份快照的完整性檢查均為 `ok`，首位元組 p95 為 0.097 秒。
