<script setup lang="ts">
import { computed } from 'vue';
import { useManageStore, type ExamPhase } from '../../../stores/manage.store';
import { useConfigStore } from '../../../stores/config.store';

const manageStore = useManageStore();
const configStore = useConfigStore();

/**
 * Phases are ordered and one-way. The console shows where the exam is and the
 * single step available from here — not a row of buttons to pick from.
 *
 * It used to offer all four as free choices, which let an operator send a
 * finished exam back to "not started" with one click and no warning.
 */
const PHASES: Record<ExamPhase, { label: string; hint: string; color: string; icon: string }> = {
  UNINITIALIZED: {
    label: '未初始化',
    hint: '尚未上傳考卷，考試機器無法註冊',
    color: 'grey',
    icon: 'mdi-database-off'
  },
  INITIALIZED: {
    label: '已初始化',
    hint: '開放機器自助註冊與環境檢查；學生尚未入場，無法登入',
    color: 'info',
    icon: 'mdi-desktop-classic'
  },
  SETUP_FINISHED: {
    label: '設定完成',
    hint: '註冊已關閉，新機器需助教核准；開放學生登入',
    color: 'warning',
    icon: 'mdi-account-check-outline'
  },
  IN_PROGRESS: {
    label: '考試中',
    hint: '已釋出考卷金鑰，學生可作答與提交',
    color: 'success',
    icon: 'mdi-play-circle'
  },
  FINISHED: {
    label: '考試結束',
    hint: '收卷緩衝期內仍接受最後上傳',
    color: 'error',
    icon: 'mdi-stop-circle'
  }
};

const current = computed(() => PHASES[manageStore.examState] ?? PHASES.UNINITIALIZED);
const next = computed<ExamPhase | null>(() => manageStore.allowedNext[0] ?? null);
const nextPhase = computed(() => (next.value ? PHASES[next.value] : null));

const PRECONDITION_LABELS: Record<string, string> = {
  exam_config: '尚未上傳考卷設定',
  students: '尚未初始化學生名單'
};

const advance = async () => {
  if (!next.value) return;
  const target = PHASES[next.value];
  if (!confirm(`確定要推進到「${target.label}」嗎？\n\n${target.hint}\n\n階段是單向的，推進後無法返回。`)) {
    return;
  }
  await manageStore.advanceExamState();
};

const reset = async () => {
  if (!confirm('確定要重置嗎？\n\n這會清空所有考試資料，並讓所有學生機器回到最初狀態。\n這是唯一能讓階段倒退的操作。')) {
    return;
  }
  await configStore.resetDatabase();
  await manageStore.fetchExamState();
};
</script>

<template>
  <v-card class="mb-4" elevation="2" border>
    <v-card-title class="text-h6 font-weight-bold px-6 pt-6">
      <v-icon start color="primary">mdi-state-machine</v-icon>
      考試階段
    </v-card-title>

    <v-card-text class="px-6 pb-6">
      <div class="d-flex align-center mb-2 mt-2">
        <span class="text-subtitle-1 font-weight-medium mr-4">目前階段：</span>
        <v-chip :color="current.color" size="large" class="font-weight-bold px-4" variant="flat">
          <v-icon start>{{ current.icon }}</v-icon>
          {{ current.label }}
        </v-chip>
      </div>
      <div class="text-body-2 text-medium-emphasis mb-6">{{ current.hint }}</div>

      <v-alert
        v-if="manageStore.missingPreconditions.length"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="mb-4"
      >
        <div class="font-weight-bold mb-1">尚未滿足推進條件</div>
        <ul class="pl-4">
          <li v-for="item in manageStore.missingPreconditions" :key="item">
            {{ PRECONDITION_LABELS[item] ?? item }}
          </li>
        </ul>
      </v-alert>

      <v-divider class="mb-6"></v-divider>

      <v-row>
        <v-col cols="12" md="8">
          <v-btn
            v-if="nextPhase && next"
            block
            size="x-large"
            :color="nextPhase.color"
            variant="flat"
            :disabled="manageStore.loading"
            :loading="manageStore.loading"
            class="text-body-1 font-weight-bold"
            data-test="advance-phase"
            @click="advance"
          >
            <v-icon start>{{ nextPhase.icon }}</v-icon>
            推進到「{{ nextPhase.label }}」
          </v-btn>
          <v-alert v-else type="info" variant="tonal" density="comfortable">
            考試已結束，沒有可推進的階段。
          </v-alert>
        </v-col>

        <v-col cols="12" md="4">
          <v-btn
            block
            size="x-large"
            color="error"
            variant="outlined"
            :disabled="manageStore.loading"
            class="text-body-1 font-weight-bold"
            data-test="reset-exam"
            @click="reset"
          >
            <v-icon start>mdi-backup-restore</v-icon>
            重置
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
