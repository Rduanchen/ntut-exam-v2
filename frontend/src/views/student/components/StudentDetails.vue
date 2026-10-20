<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStudentStore } from '../../../stores/student.store';
import { useScoreStore } from '../../../stores/score.store';
import { useConfigStore } from '../../../stores/config.store';
import CodeViewer from './CodeViewer.vue';
import SubmissionDetails from '../../../components/SubmissionDetails.vue';
import UnbindWarningDialog from '../../device/components/UnbindWarningDialog.vue';

const props = defineProps<{
  student: any;
}>();

const studentStore = useStudentStore();
const scoreStore = useScoreStore();
const configStore = useConfigStore();

const loadingCode = ref(false);
const evaluating = ref(false);
const resetLoading = ref(false);
const submissions = ref<any[]>([]);
const evalResult = ref<any>(null);
const evalError = ref<string | null>(null);
const showUnbindDialog = ref(false);

const tab = ref('code');
const isLocked = ref(true);

const emit = defineEmits<{
  (e: 'refresh-list'): void;
}>();

// Fetch code when student changes
const fetchCode = async () => {
  if (!props.student || !props.student.id) return;
  loadingCode.value = true;
  evalResult.value = null;
  evalError.value = null;
  try {
    const codeReq = studentStore.fetchStudentCode(props.student.id).then(res => submissions.value = res);
    const scoreReq = scoreStore.fetchScores();
    const configReq = configStore.fetchConfig();
    await Promise.all([codeReq, scoreReq, configReq]);
  } catch (err) {
    console.error(err);
  } finally {
    loadingCode.value = false;
  }
};

const studentScoreRecord = computed(() => {
  if (!props.student || !scoreStore.scores) return null;
  return scoreStore.scores.find(s => s.testId === props.student.id || s.user?.testId === props.student.id || s.user?.id === props.student.id);
});

// Expose fetchCode so parent can trigger it, or just watch inside component
import { watch } from 'vue';
watch(() => props.student, (newVal, oldVal) => {
  if (newVal && newVal.id !== oldVal?.id) {
    fetchCode();
  }
}, { immediate: true });

const handleResetBindingClick = () => {
  showUnbindDialog.value = true;
};

const confirmResetBinding = async () => {
  showUnbindDialog.value = false;
  resetLoading.value = true;
  try {
    await studentStore.resetDeviceBinding(props.student.id);
    emit('refresh-list');
  } catch (err) {
    alert('重新綁定失敗');
  } finally {
    resetLoading.value = false;
  }
};

const handleReevaluate = async () => {
  if (!confirm(`確定要重新評測學生 ${props.student.name} (${props.student.id}) 的所有程式碼嗎？`)) return;
  evaluating.value = true;
  evalResult.value = null;
  evalError.value = null;
  try {
    const res = await studentStore.reevaluateStudentCode(props.student.id);
    evalResult.value = res;
    // Assuming score store needs to be updated too, but we are in student view
    // A success message is fine.
  } catch (err: any) {
    evalError.value = err.message || '評測失敗';
  } finally {
    evaluating.value = false;
  }
};

const exporting = ref(false);
const handleExportCode = async () => {
  exporting.value = true;
  try {
    await studentStore.exportStudentCodeZip(props.student.id);
  } catch (err: any) {
    alert('匯出失敗');
  } finally {
    exporting.value = false;
  }
};

const handleDeleteCode = async (questionId: string) => {
  if (confirm('確定要刪除這題的程式碼嗎？')) {
    try {
      await studentStore.deleteStudentCode(props.student.id, questionId);
      await fetchCode();
    } catch (err: any) {
      alert('刪除失敗');
    }
  }
};
</script>

<template>
  <div v-if="!student" class="h-100 d-flex align-center justify-center bg-grey-lighten-4 rounded-lg border text-medium-emphasis">
    <div class="text-center">
      <v-icon size="64" class="mb-4 opacity-50">mdi-account-search</v-icon>
      <div class="text-h6">請從左側選擇一名學生</div>
    </div>
  </div>

  <div v-else class="h-100 d-flex flex-column">
    <!-- Student Header Info -->
    <v-card border elevation="1" class="mb-4">
      <v-card-text class="d-flex align-start flex-wrap gap-4">
        <v-avatar color="primary" size="80" variant="tonal" class="mr-4 mt-2">
          <span class="text-h4 font-weight-bold">{{ (student.name || '?').charAt(0).toUpperCase() }}</span>
        </v-avatar>
        
        <div class="flex-grow-1">
          <div class="d-flex align-center mb-1">
            <h2 class="text-h4 font-weight-bold mb-0 mr-4">{{ student.name || '未知學生' }}</h2>
            <v-chip
              :color="student.isOnline ? 'success' : 'grey'"
              size="small"
              variant="flat"
              class="font-weight-bold"
            >
              {{ student.isOnline ? '線上' : '離線' }}
            </v-chip>
          </div>
          <div class="text-subtitle-1 text-medium-emphasis mb-4">學號：{{ student.id }}</div>
          
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-list-item class="px-0" density="compact">
                <template v-slot:prepend>
                  <v-icon color="info" size="small" class="mr-2">mdi-ip-network</v-icon>
                </template>
                <v-list-item-title class="text-body-2">IP 位址</v-list-item-title>
                <v-list-item-subtitle class="text-body-1 font-weight-medium text-wrap" style="word-break: break-all;">
                  {{ student.ipAddress || '尚未紀錄' }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-col>
            <v-col cols="12" sm="6">
              <v-list-item class="px-0" density="compact">
                <template v-slot:prepend>
                  <v-icon color="deep-purple" size="small" class="mr-2">mdi-laptop</v-icon>
                </template>
                <v-list-item-title class="text-body-2">裝置 UUID</v-list-item-title>
                <v-list-item-subtitle class="text-body-1 font-weight-medium text-wrap" style="word-break: break-all;">
                  {{ student.deviceUuid || '尚未綁定' }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-col>
          </v-row>
        </div>

        <div class="d-flex flex-column gap-2 mt-2">
          <v-btn
            color="warning"
            prepend-icon="mdi-cellphone-link-off"
            :loading="resetLoading"
            @click="handleResetBindingClick"
            variant="flat"
            width="160"
          >
            重新綁定裝置
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-gavel"
            :loading="evaluating"
            @click="handleReevaluate"
            variant="flat"
            width="160"
          >
            重新評測程式碼
          </v-btn>
          <v-btn
            color="success"
            prepend-icon="mdi-download"
            :loading="exporting"
            @click="handleExportCode"
            variant="flat"
            width="160"
          >
            匯出學生程式碼（ZIP）
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <UnbindWarningDialog
      v-model="showUnbindDialog"
      :device="{ name: student.name, id: student.id, status: student.isOnline ? 'ONLINE' : 'UNBOUND' }"
      action="unbind"
      @confirm="confirmResetBinding"
    />

    <!-- Evaluation Result Alert -->
    <v-alert
      v-if="evalResult"
      type="success"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="evalResult = null"
    >
      重新評測請求已送出並執行成功！(如果需要查看新分數，請至成績看板重新整理)
    </v-alert>
    
    <v-alert
      v-if="evalError"
      type="error"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="evalError = null"
    >
      評測失敗: {{ evalError }}
    </v-alert>

    <!-- Desktop View: Side by side -->
    <v-row class="d-none d-lg-flex flex-grow-1 min-h-0 mx-0 mt-0">
      <v-col cols="6" class="h-100 d-flex flex-column pa-2 pl-0">
        <v-card class="h-100 d-flex flex-column" border elevation="0">
          <v-card-title class="bg-grey-lighten-4 border-b py-2 text-subtitle-1 font-weight-bold">
            <v-icon start>mdi-code-braces</v-icon> 提交程式碼
          </v-card-title>
          <CodeViewer :submissions="submissions" :loading="loadingCode" class="flex-grow-1" @delete="handleDeleteCode" />
        </v-card>
      </v-col>
      <v-col cols="6" class="h-100 d-flex flex-column pa-2 pr-0">
        <v-card class="h-100 d-flex flex-column" border elevation="0">
          <v-card-title class="bg-grey-lighten-4 border-b py-2 text-subtitle-1 font-weight-bold">
            <v-icon start>mdi-format-list-checks</v-icon> 評測結果
          </v-card-title>
          <v-card-text class="pa-4 flex-grow-1 min-h-0 h-100">
            <SubmissionDetails :scoreRecord="studentScoreRecord" :examConfig="configStore.config" v-model:isLocked="isLocked" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Mobile View: Tabs -->
    <div class="d-lg-none flex-grow-1 d-flex flex-column min-h-0 mt-4">
      <v-tabs v-model="tab" color="primary" class="mb-4 flex-shrink-0">
        <v-tab value="code">
          <v-icon start>mdi-code-braces</v-icon>
          提交程式碼
        </v-tab>
        <v-tab value="result">
          <v-icon start>mdi-format-list-checks</v-icon>
          評測結果
        </v-tab>
      </v-tabs>

      <v-window v-model="tab" class="flex-grow-1 min-h-0 h-100" style="overflow-y: hidden;">
        <v-window-item value="code" class="h-100 d-flex flex-column">
          <CodeViewer :submissions="submissions" :loading="loadingCode" class="flex-grow-1" @delete="handleDeleteCode" />
        </v-window-item>
        
        <v-window-item value="result" class="h-100 d-flex flex-column">
          <SubmissionDetails :scoreRecord="studentScoreRecord" :examConfig="configStore.config" v-model:isLocked="isLocked" />
        </v-window-item>
      </v-window>
    </div>
  </div>
</template>

<style scoped>
.gap-2 {
  gap: 8px;
}
.gap-4 {
  gap: 16px;
}
</style>
