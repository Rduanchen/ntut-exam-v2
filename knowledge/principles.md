# 專案核心原則 (Principles)

## 核心公理 (Root Principles)

1. **安全性與防作弊優先 (Security & Anti-Cheat First)**
   考試系統的完整性與公平性是不可妥協的。所有連線與身份綁定（包含 IP 與裝置 ID）都必須經過嚴格驗證。

2. **即時同步與一致性 (Real-time Sync & Consistency)**
   考試狀態、分數更新與全域廣播，必須透過 Socket 在前後端與所有從屬服務 (master-slave) 之間保持即時同步，確保無延遲的狀態一致性。

## 衍生原則 (Derived Principles)

- **裝置綁定與解鎖需人工介入 (TA-approved Rebinding)**
  為確保安全，學生的二次裝置綁定或異常連線，皆須經過助教 (TA) 審核與管理員手動解鎖（由 Root 原則 1 衍生）。
- **嚴格的設定檔驗證 (Strict Config Integrity)**
  啟動考試前必須通過全面的系統設定驗證（例如密碼檢查、記憶體限制自動偵測），避免系統在考試中發生不可預期的崩潰（由 Root 原則 1 衍生）。
- **輸出安全截斷 (Output Truncation)**
  Judger 的執行輸出必須進行長度截斷，防止過長的輸出導致系統凍結或安全漏洞（由 Root 原則 1 衍生）。
