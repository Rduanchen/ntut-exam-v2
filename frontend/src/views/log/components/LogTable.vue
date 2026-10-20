<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  items: any[];
  loading: boolean;
}>();

// Pagination State
const currentPage = ref(1);
const itemsPerPage = ref(15);

// Reset to page 1 if items change (e.g. after filter change)
watch(() => props.items, () => {
  currentPage.value = 1;
});

// Total pages
const pageCount = computed(() => {
  return Math.ceil(props.items.length / itemsPerPage.value) || 1;
});

// Paginated items
const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return props.items.slice(start, end);
});

// Expanded details mapping (log ID -> boolean)
const expandedLogs = ref<Record<number, boolean>>({});

const toggleDetails = (id: number) => {
  expandedLogs.value[id] = !expandedLogs.value[id];
};

// Format date helper
const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// Prettify details helper
const formatDetails = (details: string) => {
  if (!details) return '無詳細內容';
  try {
    const parsed = JSON.parse(details);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return details;
  }
};

// Chip color helper for ActionType
const getActionColor = (actionType: string) => {
  const type = actionType.toUpperCase();
  if (type.includes('LOGIN')) return 'success';
  if (type.includes('SUBMIT') || type.includes('CODE')) return 'info';
  if (type.includes('ERROR') || type.includes('FAIL')) return 'error';
  if (type.includes('WARNING') || type.includes('CHEAT')) return 'warning';
  return 'primary';
};
</script>

<template>
  <div>
    <v-card class="rounded-lg" border elevation="1">
      <v-table hover class="log-table">
        <thead>
          <tr>
            <th class="text-left font-weight-bold" style="width: 180px;">時間</th>
            <th class="text-left font-weight-bold" style="width: 130px;">學號</th>
            <th class="text-left font-weight-bold" style="width: 140px;">IP 位址</th>
            <th class="text-left font-weight-bold" style="width: 160px;">動作類型</th>
            <th class="text-left font-weight-bold">說明/詳情</th>
            <th class="text-center font-weight-bold" style="width: 90px;">動作</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="props.loading && props.items.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              <v-progress-circular indeterminate color="primary" class="mr-2"></v-progress-circular>
              載入日誌中...
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!props.loading && props.items.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              找不到符合搜尋條件的日誌
            </td>
          </tr>

          <!-- Log Rows -->
          <template v-else v-for="log in paginatedItems" :key="log.id">
            <tr :class="{ 'expanded-row-bg': expandedLogs[log.id] }">
              <td class="text-body-2 font-code">{{ formatTime(log.timestamp) }}</td>
              <td>
                <span class="font-weight-medium">{{ log.testId }}</span>
              </td>
              <td class="text-body-2 font-code">
                {{ log.ipAddress || 'N/A' }}
              </td>
              <td>
                <v-chip
                  :color="getActionColor(log.actionType)"
                  size="small"
                  label
                  class="font-weight-bold text-uppercase"
                >
                  {{ log.actionType }}
                </v-chip>
              </td>
              <td class="text-truncate" style="max-width: 400px;">
                <span class="text-body-2">{{ log.details || '無詳細內容' }}</span>
              </td>
              <td class="text-center">
                <v-btn
                  size="small"
                  variant="text"
                  :icon="expandedLogs[log.id] ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                  @click="toggleDetails(log.id)"
                ></v-btn>
              </td>
            </tr>

            <!-- Expanded Details Row -->
            <tr v-if="expandedLogs[log.id]" class="detail-row expanded-row-bg">
              <td colspan="6" class="pa-4">
                <v-card variant="outlined" class="bg-grey-lighten-4 rounded">
                  <v-card-text class="pa-3">
                    <div class="text-subtitle-2 font-weight-bold mb-1">詳細 JSON 資料:</div>
                    <pre class="detail-pre font-code">{{ formatDetails(log.details) }}</pre>
                  </v-card-text>
                </v-card>
              </td>
            </tr>
          </template>
        </tbody>
      </v-table>

      <!-- Pagination controls -->
      <v-divider></v-divider>
      <div class="d-flex align-center justify-space-between px-6 py-3">
        <div class="text-caption text-medium-emphasis">
          顯示第 {{ (currentPage - 1) * itemsPerPage + 1 }} 到 {{ Math.min(currentPage * itemsPerPage, props.items.length) }} 筆，共 {{ props.items.length }} 筆
        </div>
        <v-pagination
          v-model="currentPage"
          :length="pageCount"
          :total-visible="5"
          density="comfortable"
          active-color="primary"
        ></v-pagination>
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.font-code {
  font-family: monospace, Courier, monospace;
}
.log-table {
  background: transparent;
}
.expanded-row-bg {
  background-color: rgba(var(--v-theme-primary), 0.03);
}
.detail-row {
  border-top: none !important;
}
.detail-pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 0.85rem;
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}
</style>
