# 契約 fixture 的維護規則

**Feature**: 007-exam-lifecycle-state-machine

`exam-config-payload.fixture.json` 是三份 config schema 定義之間**唯一**的共同錨點。它們不共用任何程式碼，所以除了這份檔案之外，沒有任何機制能發現彼此漂移。

## 三份定義與三份副本

| 定義 | 形式 | fixture 副本 |
|---|---|---|
| `host/backend/src/schemas/config.schema.ts` | zod `^3` | `host/backend/test/fixtures/exam-config-payload.fixture.json` |
| `host/frontend/src/types/config.ts` | TypeScript type | `host/frontend/test/fixtures/exam-config-payload.fixture.json` |
| `desktop/src/main/schemas/examConfig.schema.ts` | zod `^4` | `desktop/test/fixtures/exam-config-payload.fixture.json` |

三份副本必須**逐位元組相同**。

## 為什麼是複製而不是共用

兩個 repo 獨立版控、獨立套件管理，無法共用程式碼；管理端另需一份可供表單綁定的 TypeScript type。抽成 npm 套件需維護第三個發布流程，成本高於本功能的價值（見 `plan.md` C1）。

複製的代價是可能漏改 —— 而 `scripts/check-contract-fixture.sh` 正是為此存在。

## 修改契約的程序

任何一端修改 config 的欄位（新增、刪除、改名、改型別）時：

1. **先改 fixture**，在 `full` 樣本填入新欄位，在 `minimal` 樣本省略它（若為選填）
2. 用 `scripts/check-contract-fixture.sh` 把該檔複製到另外兩處，或手動確保三份相同
3. 更新三份 schema 定義
4. 若新欄位是**管理員可編輯的考卷欄位**，同步更新管理端表單：
   - `frontend/src/types/config.ts`
   - `frontend/src/stores/config.store.ts`（預設值）
   - `frontend/src/views/config/components/GeneralSettingsEditor.vue`（表單欄位）
5. 三端測試各跑一次

```bash
# 檢查三份是否一致
pnpm test:contract-fixture

# 一致性檢查已內建於 host 的 test
pnpm test

# 三端各自的 schema 驗證
pnpm --filter backend test
pnpm --filter frontend test
cd ../desktop && npm test
```

`DESKTOP_REPO=<path>` 可指定 desktop repo 位置（預設為 host 的同層 `../desktop`）。`SKIP_DESKTOP=1` 僅在該 repo 確實不可用時使用（例如未 checkout 的 CI），**不得**用來繞過不一致。

## `full` 與 `minimal` 兩組樣本的用意

`full` 填滿所有選填欄位，`minimal` 一律省略。兩者並存不是為了湊數 —— 後端與學生端的 zod 主版本不同（`^3` vs `^4`），兩者在**預設值填充**與 `catchall` 的行為未必一致，而該差異只有在「欄位缺席」時才會顯現。

## 這個缺口已經咬過一次

`frontend/src/types/config.ts` 內留有一段註解，記錄 feature 004 新增 `judgerSettings` 欄位後，該型別描述了舊 schema 一段時間而無人察覺 —— 「nothing binds this type to the backend's. Binding them is recorded as a finding, not attempted here」。

`knowledge/experience.md` 第 4 條記載的是同一類事故的另一次：fixture 與 production schema 脫鉤，紅燈持續約兩個月。其教訓是「fixture 必須型別綁定到 production schema 且只有單一來源」。跨 repo 做不到單一來源，這份檔案與檢查腳本是最接近的替代。
