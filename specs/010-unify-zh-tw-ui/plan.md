# Implementation Plan: 管理介面繁體中文用語統一

**Branch**: `feat/010-unify-zh-tw-ui`（規劃目標；目前工作樹仍在 `feat/009-download-sqlite-backup`） | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-unify-zh-tw-ui/spec.md`

## Summary

盤點管理端九個主要區域所有使用者可見的固定文案，建立台灣繁體中文用語表與必要英文例外。翻譯畫面顯示文字與操作情境訊息，保留資料值、原始診斷、使用者內容及固定確認字串。以既有元件測試與逐頁走查驗證顯示一致性、高風險操作及錯誤歸因。

## Technical Context

**Language/Version**: TypeScript 6.0、Vue 3.5 單檔元件

**Primary Dependencies**: Vuetify 3、Pinia 3、Vue Router 5、Axios；不新增多語系相依

**Storage**: 不新增持久資料；既有管理設定及考試資料形狀不變

**Testing**: Vitest 4、Vue Test Utils、happy-dom；`pnpm --filter frontend test`、`typecheck`、`build`，外加九區域人工走查

**Target Platform**: 管理端瀏覽器，含窄螢幕版面

**Project Type**: 前後端分離的考試管理 Web 應用；本功能只調整管理端前端

**Performance Goals**: 不新增網路請求或非同步翻譯工作；維持既有操作反應

**Constraints**: 不能改 API／Socket 值、路由、識別碼、使用者內容與高風險確認門檻；`CONFIRM` 維持精確比對；錯誤歸因不可失真

**Scale/Scope**: 九個導覽區域、約 50 個可見頁面／元件檔，另含共用元件、狀態文字、錯誤回退文案與瀏覽器頁面標題

## Constitution Check

*GATE: Phase 0 前已檢查；Phase 1 設計完成後再次確認。*

- [x] **Type Safety**: 譯名映射使用明確型別與既有狀態值對應，不以未檢查的動態值取代契約。
- [x] **Async & Concurrency**: 僅在顯示層進行同步文字選擇，不變更非同步流程、Socket 事件或並行行為。
- [x] **Security & Stability**: 保留 `CONFIRM`、重設門檻、失敗歸因與原始診斷；長文案須在窄螢幕完整呈現。
- [x] **Low Coupling**: 就地處理單頁文案；僅對跨頁重複概念使用小型共用顯示映射，不引入完整 i18n 架構。
- [x] **Testability**: 新增或更新可見文字、狀態映射及高風險流程的測試；完整測試與覆蓋率為合併門檻。現有專案覆蓋率缺口屬既有問題，不在此功能中宣稱已達 100%。

**Branch gate**: 實作前須將本功能移至專用 `feat/010-unify-zh-tw-ui` 工作分支或隔離工作樹。現有 `feat/009-download-sqlite-backup` 有未提交修改，不能直接切換並混入實作提交。

**Post-design recheck**: 介面契約將顯示標籤與底層值分離；研究與驗證指引涵蓋確認門檻、歸因、原始資料及窄螢幕。上述五項設計門檻維持通過。合併前仍須依憲法確認全專案測試與覆蓋率門檻。

## Project Structure

### Documentation (this feature)

```text
specs/010-unify-zh-tw-ui/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── admin-ui-copy.md
```

### Source Code (repository root)

```text
frontend/
├── index.html
├── src/
│   ├── App.vue
│   ├── components/
│   ├── views/
│   │   ├── manage/
│   │   ├── config/
│   │   ├── judge/
│   │   ├── score/
│   │   ├── student/
│   │   ├── anticheat/
│   │   ├── log/
│   │   ├── connection/
│   │   └── device/
│   ├── stores/
│   ├── types/
│   └── utils/
└── test/
```

**Structure Decision**: 保持現有元件與頁面結構。固定文案在其擁有的元件中翻譯；跨頁狀態與術語若重複才抽成小型顯示映射；資料值與 API 契約留在既有型別及 store 中。依 `frontend/AGENT.md`，避免讓頁面元件因新增文案超過 150 行，必要時抽至同頁子元件。

## Implementation Approach

1. 以九個路由建立可見文案清冊：導覽、標題、欄位、按鈕、選項、狀態、空白／載入／錯誤及對話框。記錄保留英文的例外與對應中文說明。
2. 先定稿共用譯名與保留術語，再依頁面修改固定文案。優先處理英文最密集的考試設定、連線、評測設定與設備頁。
3. 對前端自產的錯誤提供中文操作情境；外部錯誤與診斷文字仍顯示原文。對評測結果保留代碼並顯示正確中文含義及歸因。
4. 保持狀態值、路由、資料與固定確認字串不變；更新可見文字斷言並補足高風險與狀態映射驗證。
5. 完成型別、測試、建置與逐頁／窄螢幕走查，核對 [介面契約](contracts/admin-ui-copy.md)。
