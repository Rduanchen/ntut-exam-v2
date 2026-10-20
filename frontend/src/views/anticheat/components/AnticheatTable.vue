<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAnticheatStore } from '../../../stores/anticheat.store';

const props = defineProps<{
  items: any[];
  loading: boolean;
}>();

const anticheatStore = useAnticheatStore();

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

// Row-level updating states
const updatingIds = ref<Record<number, boolean>>({});

const handleStatusChange = async (alert: any, value: boolean) => {
  updatingIds.value[alert.id] = true;
  try {
    await anticheatStore.toggleAlertStatus(alert.id, value);
  } catch (err) {
    console.error('Failed to toggle status:', err);
  } finally {
    updatingIds.value[alert.id] = false;
  }
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

// Get warning type chip attributes
const getWarningColor = (type: string) => {
  const t = type.toUpperCase();
  if (t === 'APP_ON_QUIT') return 'error';
  if (t === 'MULTIPLE_IPS') return 'warning';
  if (t === 'MULTIPLE_USERS_ON_IP') return 'deep-orange';
  return 'primary';
};

const getWarningText = (type: string) => {
  const t = type.toUpperCase();
  if (t === 'APP_ON_QUIT') return '應用程式異常退出';
  if (t === 'MULTIPLE_IPS') return '單人多重 IP';
  if (t === 'MULTIPLE_USERS_ON_IP') return '單 IP 多人登入';
  return `未識別警告（${type}）`;
};
</script>

<template>
  <div>
    <v-card class="rounded-lg" border elevation="1">
      <v-table hover class="anticheat-table">
        <thead>
          <tr>
            <th class="text-left font-weight-bold" style="width: 180px;">時間</th>
            <th class="text-left font-weight-bold" style="width: 130px;">學號</th>
            <th class="text-left font-weight-bold" style="width: 140px;">IP 位址</th>
            <th class="text-left font-weight-bold" style="width: 180px;">異常類型</th>
            <th class="text-left font-weight-bold">描述訊息</th>
            <th class="text-center font-weight-bold" style="width: 120px;">是否正常</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="props.loading && props.items.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              <v-progress-circular indeterminate color="primary" class="mr-2"></v-progress-circular>
              載入異常警告中...
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!props.loading && props.items.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              目前無符合條件的異常警告記錄
            </td>
          </tr>

          <!-- Rows -->
          <tr v-else v-for="alert in paginatedItems" :key="alert.id" :class="{ 'resolved-row-bg': alert.isOk }">
            <td class="text-body-2 font-code">{{ formatTime(alert.time) }}</td>
            <td>
              <span class="font-weight-medium">{{ alert.testId }}</span>
            </td>
            <td class="text-body-2 font-code">
              {{ alert.ipAddress || 'N/A' }}
            </td>
            <td>
              <v-chip
                :color="getWarningColor(alert.type)"
                size="small"
                label
                class="font-weight-bold text-uppercase"
              >
                {{ getWarningText(alert.type) }}
              </v-chip>
            </td>
            <td>
              <span class="text-body-2 text-wrap-break">{{ alert.message }}</span>
            </td>
            <td class="text-center">
              <div class="d-flex justify-center align-center">
                <v-switch
                  :model-value="alert.isOk"
                  :loading="updatingIds[alert.id]"
                  :disabled="updatingIds[alert.id]"
                  color="success"
                  hide-details
                  density="compact"
                  class="d-inline-flex status-switch"
                  @update:model-value="(val) => handleStatusChange(alert, !!val)"
                ></v-switch>
              </div>
            </td>
          </tr>
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
.anticheat-table {
  background: transparent;
}
.text-wrap-break {
  white-space: normal;
  word-break: break-all;
}
.status-switch :deep(.v-selection-control) {
  min-height: auto;
}
.resolved-row-bg {
  opacity: 0.75;
  background-color: rgba(var(--v-theme-success), 0.02);
}
</style>
