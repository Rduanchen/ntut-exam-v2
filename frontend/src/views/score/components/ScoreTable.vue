<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  items: any[];
  config: any;
  loading: boolean;
  search: string;
}>();

const emit = defineEmits<{
  (e: "click-row", item: any): void;
  (e: "update:search", value: string): void;
}>();

const tableRef = ref<HTMLElement | null>(null);

// Filter items based on student ID or name search
const filteredItems = computed(() => {
  if (!props.search) return props.items;
  const q = props.search.toLowerCase();
  return props.items.filter((item) => {
    const testId = (item["user.testId"] || "").toLowerCase();
    const name = (item["user.name"] || "").toLowerCase();
    return testId.includes(q) || name.includes(q);
  });
});

// Helper: Calculate total subtasks in all puzzles of a section
const getSectionSubtaskCount = (section: any) => {
  if (!section.puzzles || section.puzzles.length === 0) return 1;
  return section.puzzles.reduce((sum: number, puzzle: any) => {
    return sum + Math.max(puzzle.subtasks?.length || 0, 1);
  }, 0);
};

// Helper: Get global puzzle index
const getPuzzleGlobalIndex = (puzzleId: string) => {
  if (!props.config?.sections) return -1;
  return props.config.sections
    .flatMap((s: any) => s.puzzles || [])
    .findIndex((p: any) => p.id === puzzleId);
};

const getPuzzleResult = (item: any, puzzleId: string) => {
  if (!item.puzzleResults) return undefined;
  let res = item.puzzleResults[puzzleId];
  if (!res) {
    const idx = getPuzzleGlobalIndex(puzzleId);
    if (idx !== -1) res = item.puzzleResults[`Q${idx + 1}`];
  }
  return res;
};

// Helper: Get status of a subtask ('T' or 'F')
const getSubtaskStatus = (item: any, puzzleId: string, subtaskIdx: any) => {
  const pResult = getPuzzleResult(item, puzzleId);
  if (!pResult || !pResult.subtasks) return "F";

  const idx = Number(subtaskIdx);
  const stRes = pResult.subtasks[idx];
  if (!stRes) return "F";

  const puzzleConfig = props.config?.sections
    ?.flatMap((s: any) => s.puzzles || [])
    .find((p: any) => p.id === puzzleId);
  const subtaskConfig = puzzleConfig?.subtasks?.[idx];

  if (!subtaskConfig) return "F";

  const allVisible =
    subtaskConfig.visible?.length > 0
      ? subtaskConfig.visible.every(
          (_: any, i: number) =>
            stRes.visible &&
            (stRes.visible[i]?.status || stRes.visible[i]?.statusCode) === "AC",
        )
      : true;

  const allHidden =
    subtaskConfig.hidden?.length > 0
      ? subtaskConfig.hidden.every(
          (_: any, i: number) =>
            stRes.hidden &&
            (stRes.hidden[i]?.status || stRes.hidden[i]?.statusCode) === "AC",
        )
      : true;

  return allVisible && allHidden ? "T" : "F";
};

// Copy Table to Excel
const copyToClipboard = async () => {
  const config = props.config;
  if (!config) return;

  const lines: string[] = [];

  // Header 1: Section Title
  const row1 = ["學號", "姓名", "總分"];
  config.sections.forEach((sec: any) => {
    const colCount = getSectionSubtaskCount(sec);
    row1.push(sec.title);
    for (let i = 1; i < colCount; i++) row1.push("");
  });
  lines.push(row1.join("\t"));

  // Header 2: Puzzle Title
  const row2 = ["", "", ""];
  config.sections.forEach((sec: any) => {
    if (!sec.puzzles || sec.puzzles.length === 0) {
      row2.push("-");
      return;
    }
    sec.puzzles.forEach((puz: any) => {
      const colCount = Math.max(puz.subtasks?.length || 0, 1);
      row2.push(puz.title);
      for (let i = 1; i < colCount; i++) row2.push("");
    });
  });
  lines.push(row2.join("\t"));

  // Header 3: Subtask Index
  const row3 = ["", "", ""];
  config.sections.forEach((sec: any) => {
    if (!sec.puzzles || sec.puzzles.length === 0) {
      row3.push("-");
      return;
    }
    sec.puzzles.forEach((puz: any) => {
      if (puz.subtasks && puz.subtasks.length > 0) {
        puz.subtasks.forEach((_: any, idx: number) => {
          row3.push((idx + 1).toString());
        });
      } else {
        row3.push("-");
      }
    });
  });
  lines.push(row3.join("\t"));

  // Data Rows
  filteredItems.value.forEach((item) => {
    const row = [
      item["user.testId"] || "",
      item["user.name"] || "",
      item.score?.toString() || "0",
    ];
    config.sections.forEach((sec: any) => {
      if (!sec.puzzles || sec.puzzles.length === 0) {
        row.push("-");
        return;
      }
      sec.puzzles.forEach((puz: any) => {
        if (puz.subtasks && puz.subtasks.length > 0) {
          puz.subtasks.forEach((_: any, idx: number) => {
            row.push(getSubtaskStatus(item, puz.id, idx));
          });
        } else {
          row.push("-");
        }
      });
    });
    lines.push(row.join("\t"));
  });

  const tsvContent = lines.join("\n");

  try {
    // Generate HTML for perfect Excel pasting (maintains rowspan/colspan and colors)
    let htmlContent = "";
    if (tableRef.value) {
      const clone = tableRef.value.cloneNode(true) as HTMLElement;
      // Remove sticky classes so Excel doesn't misinterpret them
      const elements = clone.querySelectorAll(".sticky-col");
      elements.forEach((el) => el.classList.remove("sticky-col"));
      htmlContent = clone.outerHTML;
    }

    if (navigator.clipboard && window.ClipboardItem) {
      const dataItems: Record<string, Blob> = {
        "text/plain": new Blob([tsvContent], { type: "text/plain" }),
      };
      if (htmlContent) {
        dataItems["text/html"] = new Blob([htmlContent], { type: "text/html" });
      }
      const clipboardItem = new ClipboardItem(dataItems);
      await navigator.clipboard.write([clipboardItem]);
    } else {
      // Fallback
      await navigator.clipboard.writeText(tsvContent);
    }
    alert("表格內容已複製到剪貼簿，可以直接在 Excel 中貼上！");
  } catch (err) {
    console.error("複製失敗:", err);
    alert("複製失敗，請手動選取複製");
  }
};
</script>

<template>
  <v-card class="rounded-lg" border elevation="1">
    <v-card-title
      class="d-flex align-center justify-space-between pa-4 flex-wrap gap-4"
    >
      <v-text-field
        :model-value="props.search"
        @update:model-value="(val) => emit('update:search', val as string)"
        append-inner-icon="mdi-magnify"
          label="搜尋學生（學號／姓名）"
        single-line
        hide-details
        density="compact"
        style="max-width: 300px"
      ></v-text-field>

      <v-btn
        color="success"
        prepend-icon="mdi-microsoft-excel"
        @click="copyToClipboard"
        :disabled="props.items.length === 0"
      >
        複製到 Excel
      </v-btn>
    </v-card-title>

    <v-divider></v-divider>

    <div class="table-container">
      <table ref="tableRef" class="score-table-custom">
        <thead>
          <!-- Row 1: Section headers -->
          <tr>
            <th
              rowspan="3"
              class="text-center font-weight-bold cell-border text-subtitle-2 bg-grey-lighten-4 sticky-col col-1 head-cell"
            >
              學號
            </th>
            <th
              rowspan="3"
              class="text-center font-weight-bold cell-border text-subtitle-2 bg-grey-lighten-4 sticky-col col-2 head-cell"
            >
              姓名
            </th>
            <th
              rowspan="3"
              class="text-center font-weight-bold cell-border text-subtitle-2 bg-grey-lighten-4 sticky-col col-3 head-cell"
            >
              總分
            </th>
            <th
              v-for="section in props.config?.sections"
              :key="section.id"
              :colspan="getSectionSubtaskCount(section)"
              class="text-center font-weight-bold cell-border bg-grey-lighten-3 text-body-2 py-2"
            >
              {{ section.title }}
            </th>
          </tr>
          <!-- Row 2: Puzzle headers -->
          <tr>
            <template
              v-for="section in props.config?.sections"
              :key="section.id"
            >
              <template v-if="section.puzzles && section.puzzles.length > 0">
                <th
                  v-for="puzzle in section.puzzles"
                  :key="puzzle.id"
                  :colspan="Math.max(puzzle.subtasks?.length || 0, 1)"
                  class="text-center font-weight-bold cell-border bg-grey-lighten-4 text-caption py-1"
                >
                  {{ puzzle.title }}
                </th>
              </template>
              <th
                v-else
                class="text-center font-weight-bold cell-border bg-grey-lighten-4 text-caption py-1"
              >
                -
              </th>
            </template>
          </tr>
          <!-- Row 3: Subtask Index headers -->
          <tr>
            <template
              v-for="section in props.config?.sections"
              :key="section.id"
            >
              <template v-if="section.puzzles && section.puzzles.length > 0">
                <template v-for="puzzle in section.puzzles" :key="puzzle.id">
                  <th
                    v-for="(_, idx) in puzzle.subtasks"
                    :key="idx"
                    class="text-center font-weight-bold cell-border text-caption py-1 px-2 subtask-header"
                  >
                    {{ Number(idx) + 1 }}
                  </th>
                  <th
                    v-if="!puzzle.subtasks || puzzle.subtasks.length === 0"
                    class="text-center font-weight-bold cell-border text-caption py-1 px-2"
                  >
                    -
                  </th>
                </template>
              </template>
              <template v-else>
                <th
                  class="text-center font-weight-bold cell-border text-caption py-1 px-2"
                >
                  -
                </th>
              </template>
            </template>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="props.loading && props.items.length === 0">
            <td :colspan="100" class="text-center py-6 text-medium-emphasis">
              <v-progress-circular
                indeterminate
                color="primary"
                class="mr-2"
              ></v-progress-circular>
              載入中...
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!props.loading && filteredItems.length === 0">
            <td :colspan="100" class="text-center py-6 text-medium-emphasis">
              找不到符合搜尋條件的學生資料
            </td>
          </tr>

          <!-- Score Rows -->
          <tr
            v-else
            v-for="item in filteredItems"
            :key="item.id"
            @click="emit('click-row', item)"
            class="cursor-pointer score-row"
          >
            <td
              class="sticky-col col-1 text-body-2 font-weight-medium cell-border px-2 py-2 text-ellipsis text-center"
              :title="item['user.testId']"
            >
              {{ item["user.testId"] }}
            </td>
            <td
              class="sticky-col col-2 text-body-2 cell-border px-2 py-2 text-ellipsis text-center"
              :title="item['user.name']"
            >
              {{ item["user.name"] }}
            </td>
            <td
              class="sticky-col col-3 text-center text-body-2 font-weight-bold color-score cell-border px-2 py-2 text-ellipsis"
              :title="item.score"
            >
              {{ item.score }}
            </td>

            <template
              v-for="section in props.config?.sections"
              :key="section.id"
            >
              <template v-if="section.puzzles && section.puzzles.length > 0">
                <template v-for="puzzle in section.puzzles" :key="puzzle.id">
                  <td
                    v-for="(_, idx) in puzzle.subtasks"
                    :key="idx"
                    class="text-center py-1 px-2 cell-border"
                  >
                    <v-chip
                      :color="
                        getSubtaskStatus(item, puzzle.id, idx) === 'T'
                          ? 'success'
                          : 'error'
                      "
                      size="small"
                      class="font-weight-bold px-2"
                      variant="flat"
                      style="min-width: 28px; height: 22px"
                    >
                      {{ getSubtaskStatus(item, puzzle.id, idx) === 'T' ? '通過' : '未通過' }}
                    </v-chip>
                  </td>
                  <td
                    v-if="!puzzle.subtasks || puzzle.subtasks.length === 0"
                    class="text-center py-1 px-2 cell-border"
                  >
                    -
                  </td>
                </template>
              </template>
              <td v-else class="text-center py-1 px-2 cell-border">-</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </v-card>
</template>

<style scoped>
.table-container {
  overflow-x: auto;
  max-width: 100%;
  padding-bottom: 8px; /* For scrollbar */
}
.score-table-custom {
  border-collapse: collapse;
  width: 100%;
  min-width: 800px;
}
.score-table-custom th,
.score-table-custom td {
  border: 1px solid #e0e0e0;
  vertical-align: middle;
}
.cell-border {
  border: 1px solid #e0e0e0 !important;
}
.subtask-header {
  min-width: 36px;
  background-color: #fafafa;
}
.score-row {
  transition: background-color 0.15s ease;
}
.score-row:hover td {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.score-row:hover td.sticky-col {
  background-color: white;
  background-image: linear-gradient(
    rgba(var(--v-theme-primary), 0.04),
    rgba(var(--v-theme-primary), 0.04)
  );
}
.color-score {
  color: #1976d2;
}
.gap-4 {
  gap: 16px;
}
.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Frozen columns styling */
@media (min-width: 769px) {
  .sticky-col {
    position: sticky;
    z-index: 2;
    background-color: white;
  }
  thead tr th.sticky-col {
    z-index: 4;
  }
  .col-1 {
    left: 0;
    box-shadow: 1px 0 0 #e0e0e0;
    width: 110px;
    min-width: 110px;
    max-width: 110px;
  }
  .col-2 {
    left: 110px;
    box-shadow: 1px 0 0 #e0e0e0;
    width: 100px;
    min-width: 100px;
    max-width: 100px;
  }
  .col-3 {
    left: 210px;
    box-shadow: 2px 0 5px -2px rgba(0, 0, 0, 0.1);
    width: 80px;
    min-width: 80px;
    max-width: 80px;
  }
}

@media (max-width: 768px) {
  .sticky-col {
    position: static !important;
    width: auto !important;
    min-width: auto !important;
    max-width: auto !important;
    box-shadow: none !important;
  }
}

.head-cell {
  background-color: #f5f5f5 !important;
}
</style>
