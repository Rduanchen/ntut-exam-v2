<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '../../../stores/config.store';
import { useManageStore } from '../../../stores/manage.store';

const configStore = useConfigStore();
const manageStore = useManageStore();

const emit = defineEmits(['init']);

/**
 * What the backend still wants before the exam may leave UNINITIALIZED.
 *
 * Initialisation is the gate that stops a phase claiming machines may register
 * against a roster that does not exist. Being told "not yet" without being told
 * what is missing leaves the operator hunting.
 */
const PRECONDITION_LABELS: Record<string, string> = {
  exam_config: '尚未上傳考卷設定',
  students: '尚未建立學生名單（請先執行初始化）'
};

const missing = computed(() =>
  manageStore.missingPreconditions.map((key) => PRECONDITION_LABELS[key] ?? key)
);

const handleInit = async () => {
  if (confirm('確定要初始化資料庫嗎？\n\n這會依考卷設定建立學生名單與成績單。')) {
    emit('init');
  }
};

const handleReset = async () => {
  if (
    confirm(
      '確定要重置資料庫嗎？\n\n這會清空所有測資、作答與成績，並讓所有學生機器回到最初狀態。'
    )
  ) {
    await configStore.resetDatabase();
  }
};
</script>

<template>
  <v-card class="rounded-lg" elevation="2">
    <v-card-item>
      <v-card-title>資料庫初始化</v-card-title>
      <v-card-subtitle>初始化或重置後端資料表</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert
        v-if="missing.length"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-test="init-preconditions"
      >
        <div class="font-weight-bold mb-1">尚未滿足推進條件</div>
        <ul class="pl-4">
          <li v-for="item in missing" :key="item">{{ item }}</li>
        </ul>
      </v-alert>

      <v-alert
        v-if="configStore.error"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-test="init-error"
      >
        {{ configStore.error }}
      </v-alert>

      <div v-if="configStore.isInitialized">
        <v-alert type="success" variant="tonal" class="mb-4" density="compact">
          資料庫已初始化，核心設定已鎖定。
        </v-alert>
        <v-btn color="error" block :loading="configStore.loading" @click="handleReset">
          重置資料庫
        </v-btn>
      </div>
      <div v-else>
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          等待初始化
        </v-alert>
        <v-btn color="primary" block :loading="configStore.loading" @click="handleInit">
          初始化資料庫
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>
