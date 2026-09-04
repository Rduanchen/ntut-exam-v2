<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useReadinessStore } from '../../../stores/readiness.store';
import type { StudentReadiness } from '../../../types/readiness';

const readinessStore = useReadinessStore();

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await readinessStore.refresh();
  timer = setInterval(() => readinessStore.refresh(), 5000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const summary = computed(() => readinessStore.report?.summary);

/**
 * Why this seat is not ready, in the order that matters to the invigilator.
 *
 * A failed environment check is first because it needs a different response
 * from every other reason: the seat cannot be used at all, and no amount of
 * waiting will change that.
 */
function reason(student: StudentReadiness): { text: string; color: string } {
  if (student.envCheckStatus === 'FAILED') {
    const langs = student.envCheckFailedLanguages.join('、');
    return { text: langs ? `執行環境檢查失敗：${langs}` : '執行環境檢查失敗', color: 'error' };
  }
  if (!student.isRegistered) return { text: '機器尚未註冊', color: 'grey' };
  if (!student.isLoggedIn) return { text: '尚未登入', color: 'warning' };
  if (!student.isOnline) return { text: '已掉線', color: 'error' };
  if (student.envCheckStatus === 'RUNNING') return { text: '環境檢查進行中', color: 'info' };
  if (student.envCheckStatus !== 'PASSED') return { text: '尚未回報環境檢查', color: 'grey' };
  return { text: '已就緒', color: 'success' };
}

function elapsed(iso: string | null): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分鐘前`;
  return `${Math.round(seconds / 3600)} 小時前`;
}
</script>

<template>
  <v-card class="mb-4" elevation="2" border>
    <v-card-title class="text-h6 font-weight-bold px-6 pt-6 d-flex align-center">
      <v-icon start color="primary">mdi-account-multiple-check</v-icon>
      學生準備狀況
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        :loading="readinessStore.loading"
        data-test="refresh-readiness"
        @click="readinessStore.refresh()"
      >
        重新整理
      </v-btn>
    </v-card-title>

    <v-card-text class="px-6 pb-6">
      <v-alert v-if="readinessStore.error" type="error" variant="tonal" density="compact" class="mb-4">
        {{ readinessStore.error }}
      </v-alert>

      <v-row v-if="summary" class="mb-2" data-test="readiness-summary">
        <v-col cols="6" md="3">
          <div class="text-caption text-medium-emphasis">已就緒</div>
          <div class="text-h5 font-weight-bold">{{ summary.ready }} / {{ summary.total }}</div>
        </v-col>
        <v-col cols="6" md="3">
          <div class="text-caption text-medium-emphasis">已登入</div>
          <div class="text-h5 font-weight-bold">{{ summary.loggedIn }}</div>
        </v-col>
        <v-col cols="6" md="3">
          <div class="text-caption text-medium-emphasis">已註冊機器</div>
          <div class="text-h5 font-weight-bold">{{ summary.registered }}</div>
        </v-col>
        <v-col cols="6" md="3">
          <div class="text-caption text-medium-emphasis">環境檢查失敗</div>
          <div
            class="text-h5 font-weight-bold"
            :class="summary.environmentFailed ? 'text-error' : ''"
          >
            {{ summary.environmentFailed }}
          </div>
        </v-col>
      </v-row>

      <v-alert
        v-if="readinessStore.report && !readinessStore.report.isSettlingPhase"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        目前不在「設定完成」階段，以下為即時狀態而非入場準備狀況。
      </v-alert>

      <v-divider class="mb-4" />

      <v-table density="comfortable" data-test="readiness-table">
        <thead>
          <tr>
            <th>學號</th>
            <th>姓名</th>
            <th>狀態</th>
            <th>環境檢查</th>
            <th>最後斷線</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="student in readinessStore.needsAttention"
            :key="student.testId"
            :data-test="`readiness-row-${student.testId}`"
          >
            <td class="font-weight-medium">{{ student.testId }}</td>
            <td>{{ student.name }}</td>
            <td>
              <v-chip :color="reason(student).color" size="small" variant="flat">
                {{ reason(student).text }}
              </v-chip>
            </td>
            <td>{{ student.envCheckReportedAt ? elapsed(student.envCheckReportedAt) : '未回報' }}</td>
            <td>{{ elapsed(student.lastDisconnectedAt) }}</td>
          </tr>
          <tr v-if="!readinessStore.needsAttention.length">
            <td colspan="5" class="text-center text-medium-emphasis py-6">尚無學生資料</td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>
  </v-card>
</template>
