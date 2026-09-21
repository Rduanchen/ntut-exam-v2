<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useConfigStore } from '../../stores/config.store';
import ConfigForm from './components/ConfigForm.vue';
import DbInitPanel from './components/DbInitPanel.vue';
import { fetchOfflineBundle } from '../../api/readiness';
import { downloadJson } from '../../utils/download-json';

const configStore = useConfigStore();
const configFormRef = ref<InstanceType<typeof ConfigForm> | null>(null);

onMounted(() => {
  configStore.fetchConfig();
  configStore.fetchInitStatus();
});

const exporting = ref(false);
const exportError = ref<string | null>(null);

/**
 * Save the paper as a file for machines that cannot reach this backend.
 *
 * Contains the same halves the delivery endpoint sends and neither the key nor
 * the password, so the stick it travels on is not the exam. The password has to
 * reach the room some other way, which is the point of the reminder.
 */
const exportBundle = async () => {
  exporting.value = true;
  exportError.value = null;
  try {
    const bundle = await fetchOfflineBundle();
    downloadJson(bundle, 'exam-offline-bundle.json');
  } catch (err: any) {
    exportError.value =
      err.response?.status === 409
        ? '考卷尚未準備完成，請先完成初始化。'
        : (err.response?.data?.error ?? err.message);
  } finally {
    exporting.value = false;
  }
};

const handleInit = async () => {
  if (configFormRef.value) {
    const success = await configFormRef.value.submitForm();
    if (!success) return; // Wait for successful save before initializing
  }
  await configStore.initializeDatabase();
};
</script>

<template>
  <v-container fluid>
    <v-row class="mb-4">
      <v-col cols="12">
        <h1 class="text-h4 font-weight-bold">Exam Configuration Dashboard</h1>
        <p class="text-subtitle-1 text-medium-emphasis">Configure and initialize global exam settings</p>
      </v-col>
    </v-row>

    <!-- Error Alert -->
    <v-alert v-if="configStore.error" type="error" closable class="mb-6">
      {{ configStore.error }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="4">
        <DbInitPanel @init="handleInit" />

        <v-card class="mt-4 rounded-lg" elevation="2">
          <v-card-item>
            <v-card-title>離線佈署檔</v-card-title>
            <v-card-subtitle>供無法連線到後端的考試機器使用</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <v-alert type="info" variant="tonal" density="compact" class="mb-3">
              檔案內含加密後的考卷，<strong>不含開考口令</strong>。請以紙本或口頭把口令帶到考場，
              不要寫在這個檔案旁邊 —— 兩者放在一起等同於沒有加密。
            </v-alert>

            <v-alert
              v-if="exportError"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-3"
              data-test="export-error"
            >
              {{ exportError }}
            </v-alert>

            <v-btn
              color="secondary"
              block
              :loading="exporting"
              data-test="export-offline-bundle"
              @click="exportBundle"
            >
              <v-icon start>mdi-download</v-icon>
              匯出離線佈署檔
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="8">
        <v-card :loading="configStore.loading" class="pa-0 rounded-lg" elevation="2">
          <ConfigForm ref="configFormRef" v-if="configStore.config" :initial-data="configStore.config" :disabled="configStore.isInitialized" />
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
