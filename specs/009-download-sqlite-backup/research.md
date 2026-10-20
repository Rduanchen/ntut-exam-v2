# Research: SQLite 資料庫下載備份

## R1：一致性快照

**Decision**: 使用現有 `sqlite3@5.1.7` 的 Online Backup API，對每個請求建立獨立目的檔，以有限頁數的 `step()` 反覆推進，直到 `completed`。正式檔案型來源使用唯讀連線；來源不存在或無法開啟時先失敗，不讓套件建立新的空白來源檔。

**Rationale**: SQLite 官方說明此 API 可備份運行中的資料庫，分批複製時僅在各批讀取期間持有來源鎖，完成結果是一致快照。已安裝套件的執行時原始碼提供 `Database#backup`、`Backup#step`，且以唯讀來源及 WAL 資料進行的本地探針可成功產生獨立檔案。[SQLite Backup API](https://www.sqlite.org/backup.html)

**Alternatives considered**:

- 直接複製主檔：WAL 模式下可能漏掉已提交但尚未 checkpoint 的資料；檔案複製也沒有交易一致性保證。
- `VACUUM INTO`：可產生一致快照，但目前專案未設定 WAL；長時間讀取在預設 rollback journal 模式下可能延遲寫入提交，不利考試期間使用。[SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html)
- 一次 `step(-1)`：簡單但可能在整段複製期間持有來源鎖，因此改用固定頁數與事件迴圈讓步。實作須以實測選定每批頁數與重試上限。

## R2：型別與資料庫來源

**Decision**: 只在備份服務邊界為缺漏的 `sqlite3` 備份方法建立窄型別宣告，不擴散 `any`。服務取得與既有 Sequelize 相同的儲存位置，但不自行重算第二套預設路徑；由資料庫設定模組匯出已解析位置或注入來源。檔案型來源另開唯讀連線。

**Rationale**: `backend/src/config/database.config.ts` 已定義唯一資料庫來源。已安裝 `sqlite3/lib/sqlite3.d.ts` 缺少執行時確有的備份介面；局部宣告能保留嚴格型別。測試環境的 `DB_STORAGE=:memory:` 無法由另一連線讀到同一資料庫，因此實際備份服務使用檔案型 fixture 驗證；管理端路由仍在既有記憶體測試環境檢查權限與回應契約。

**Alternatives considered**:

- 以 `as any` 呼叫未宣告方法：違反型別安全原則。
- 直接讀取 `backend/database.sqlite`：忽略 `DB_STORAGE`，可能下載錯誤資料庫。
- 修改全專案測試設定為檔案型：影響既有測試隔離，超出此功能範圍。

## R3：回應、清理與負載

**Decision**: 端點定為 `GET /admin/backup`，繼承 `verifyAdminToken`，且預設管理憑證不得下載。先完成備份與 `PRAGMA quick_check`，再設定附件與非快取回應標頭並串流檔案。每個請求建立私有暫存目錄；在完成、產生失敗、串流錯誤、用戶端斷線時清除。服務對同時備份設定有限並行與有界等待，名額保留至傳送結束及暫存檔清理，資源不足時回覆明確的暫時性錯誤。

**Rationale**: 回應送出後無法改成 JSON 錯誤，因此驗證必須先於附件標頭。下載可能很大，串流可避免整份檔案常駐記憶體。獨立暫存目錄避免多個管理員的產物互相覆蓋；有界並行避免備份占滿 CPU、磁碟及資料庫連線。

**Alternatives considered**:

- 將整個檔案讀入 Buffer 再回傳：記憶體使用量隨資料庫大小成長。
- 固定備份檔名：並行呼叫會互相覆寫，且可能留下長期敏感副本。
- 直接開始串流後再檢查：失敗時用戶端可能拿到部分檔案並誤認為成功。

## R4：驗證方式

**Decision**: 以暫存的檔案型 SQLite 資料庫進行真實備份測試，包括已提交資料、WAL、並行寫入、同時備份、資料庫不存在、備份失敗和清理；路由測試另檢查授權、標頭、錯誤格式及下載內容。下載檔以 SQLite 開啟並執行完整性檢查。

**Rationale**: 只比對檔頭或 mock 備份 API 不能證明可還原；現有 Vitest 設定使用記憶體資料庫，無法驗證多連線與 WAL 行為。現有 `npm test` 已包含測試碼型別檢查。

**Alternatives considered**: 僅做 mock 單元測試無法驗證備份檔可用性及快照一致性。
