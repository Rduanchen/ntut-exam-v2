# Phase 0 Research: 管理介面繁體中文用語統一

## 1. 文案位置與處理方式

**Decision**: 先依九個路由整理可見文案清冊，固定文字就地翻譯；僅跨頁重複的狀態、動作與術語建立共用顯示對照。保留現有架構，不引入語言切換系統。

**Rationale**: `frontend/src/App.vue` 定義九個英文導覽名稱；文字廣布於約 50 個頁面與子元件，以及 `frontend/src/stores/` 的錯誤回退。專案沒有多語系套件，此需求只有單一預設語言。共用對照可避免「裝置／設備」或同一狀態的譯名漂移，但全量搬移文案會增加本次變更面積。

**Alternatives considered**: 全面導入 i18n 套件與語言資源檔；一次性直接替換而不建立用語表。前者超出單語需求，後者無法檢驗跨頁一致性。

## 2. 資料值、代碼與診斷

**Decision**: 將顯示名稱與實際值分離。API 狀態、路由、識別碼、檔名、單位、評測代碼及原始診斷維持原樣；中文只加在使用者可見的標籤與情境說明。未知值顯示原始值並附中文「未識別狀態」情境。

**Rationale**: `DeviceGrid.vue` 將 `ONLINE` 等狀態映射成英文顯示；`DeployTestProbeResults.vue` 直接顯示 `AC / submission`；多個 store 將後端錯誤原文傳到畫面。直接翻譯資料值會破壞篩選、判斷或診斷。 `OriginChip.vue` 的 `clamped` 表示設定值被拒絕，不能翻成單純「已調整」。

**Alternatives considered**: 修改後端錯誤與列舉值；自動翻譯任意錯誤字串。前者擴大跨端契約變更，後者會誤譯或遺失診斷。

## 3. 高風險操作與失敗歸因

**Decision**: 解除綁定、註銷與資料重設只改警告文案，保留確認條件與事件；評測結果保留原碼，中文說明依學生／系統歸因區分。

**Rationale**: `UnbindWarningDialog.vue` 對線上設備精確比對 `CONFIRM`。專案原則要求防作弊與失敗歸因隔離；`RehearsalStageList.vue` 已有系統失敗的中文說明，新增譯文不得逆轉其意思。

**Alternatives considered**: 將確認字串一併改中文；只顯示泛稱「評測失敗」。前者改變安全門檻，後者使管理員無法判斷責任來源。

## 4. 驗證與現有測試

**Decision**: 使用既有 Vitest 元件測試的 `data-test` 選取器檢查關鍵文案和操作門檻，更新依賴英文文案的斷言，再執行型別檢查、建置與九頁面走查。

**Rationale**: `frontend/test/judge-settings-view.test.ts`、`editing-ui.test.ts`、`deploy-test-view.test.ts` 有英文文字斷言；`connection-requests.test.ts`、`exam-state-controls.test.ts` 已示範行為與中文文案的元件驗證。現行 `frontend/vitest.config.ts` 的覆蓋率門檻僅涵蓋部分 API、store、工具檔，不能以該報表宣稱整個前端已達憲法的 100% 覆蓋率。

**Alternatives considered**: 只搜尋英文或只做人工審稿。兩者都無法證明高風險流程及文字渲染沒有退化。

## Resolved Questions

- 目標語言：台灣繁體中文；必要技術術語保留英文。
- 範圍：此倉庫管理端九個主要導覽區域及其子畫面、共用可見文案和瀏覽器頁面名稱。
- 新外部相依、資料遷移及 API 變更：皆不需要。
