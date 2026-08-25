# 專案願景 (Vision)

## 核心目標 (One-Sentence Goal)
打造一個安全、即時且可承受高併發負載的考試管理系統，提供完善的防作弊機制與靈活的考場管理介面。

## 目前狀態 (Current State)
系統已經具備了完整的後端架構、即時同步的 Socket 廣播系統、Piston 程式碼評測整合，以及進階的防作弊功能（包含 IP 綁定與 TA 審核裝置重綁定）。並已實作完整的負載測試架構（Load Test Mode），確保高併發時的穩定性。

## 下一步里程碑 (Next Milestones)
- **部署與環境穩健性**: 實作「[部署後壓測機制設計](file:///Users/justinchen/Documents/ntut-exam-v2/host/knowledge/draft/部署後壓測機制設計.md)」，並落實[全專案環境標準化](file:///Users/justinchen/Documents/ntut-exam-v2/host/knowledge/draft/全專案環境標準化.md)。
- **客戶端離線韌性 (Offline Resilience)**: 針對新確立的憲法，實作前端斷線重連、本地暫存與同步佇列機制。
- **測試覆蓋率對齊**（後端已完成 2026-08-23）: 後端 16 個 Service 與 13 個 Controller 已全數具備測試（34 檔 / 257 測試，services+controllers 覆蓋率 83.5%）。剩餘：前端 Vitest 尚未導入，後端 `sockets/`、`utils/`、`middlewares/` 仍未納入覆蓋率目標。
- **效能與評測核心優化**: 深入排查 [piston穩定度與併發問題](file:///Users/justinchen/Documents/ntut-exam-v2/host/knowledge/draft/piston穩定度與併發問題.md)，確保高併發評測的可靠性。
