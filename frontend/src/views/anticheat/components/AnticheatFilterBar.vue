<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  studentId: string;
  ip: string;
  type: string;
  status: string;
}>();

const emit = defineEmits<{
  (e: 'update:studentId', value: string): void;
  (e: 'update:ip', value: string): void;
  (e: 'update:type', value: string): void;
  (e: 'update:status', value: string): void;
  (e: 'reset'): void;
}>();

const localStudentId = ref(props.studentId);
const localIp = ref(props.ip);
const localType = ref(props.type);
const localStatus = ref(props.status);

watch(() => props.studentId, (newVal) => { localStudentId.value = newVal; });
watch(() => props.ip, (newVal) => { localIp.value = newVal; });
watch(() => props.type, (newVal) => { localType.value = newVal; });
watch(() => props.status, (newVal) => { localStatus.value = newVal; });

watch(localStudentId, (newVal) => { emit('update:studentId', newVal || ''); });
watch(localIp, (newVal) => { emit('update:ip', newVal || ''); });
watch(localType, (newVal) => { emit('update:type', newVal || ''); });
watch(localStatus, (newVal) => { emit('update:status', newVal || ''); });

const warningTypes = [
  { title: '全部警告類型', value: 'ALL' },
  { title: '應用程式退出', value: 'APP_ON_QUIT' },
  { title: '單人多重 IP', value: 'MULTIPLE_IPS' },
  { title: '單 IP 多人登入', value: 'MULTIPLE_USERS_ON_IP' }
];

const statusOptions = [
  { title: '全部狀態', value: 'ALL' },
  { title: '未處理', value: 'UNRESOLVED' },
  { title: '已處理', value: 'RESOLVED' }
];

const handleReset = () => {
  localStudentId.value = '';
  localIp.value = '';
  localType.value = 'ALL';
  localStatus.value = 'ALL';
  emit('reset');
};
</script>

<template>
  <v-card class="mb-6 rounded-lg" border elevation="1">
    <v-card-text class="pa-4">
      <v-row density="compact" align="center">
        <!-- Student ID Search -->
        <v-col cols="12" sm="3">
          <v-text-field
            v-model="localStudentId"
            label="學號"
            prepend-inner-icon="mdi-account"
            placeholder="搜尋學號..."
            hide-details
            clearable
            density="comfortable"
            variant="outlined"
          ></v-text-field>
        </v-col>

        <!-- IP Address Search -->
        <v-col cols="12" sm="3">
          <v-text-field
            v-model="localIp"
            label="IP 位址"
            prepend-inner-icon="mdi-ip-network"
            placeholder="搜尋 IP..."
            hide-details
            clearable
            density="comfortable"
            variant="outlined"
          ></v-text-field>
        </v-col>

        <!-- Warning Type Select -->
        <v-col cols="12" sm="2">
          <v-select
            v-model="localType"
            label="警告類型"
            :items="warningTypes"
            item-title="title"
            item-value="value"
            prepend-inner-icon="mdi-shield-alert"
            hide-details
            density="comfortable"
            variant="outlined"
          ></v-select>
        </v-col>

        <!-- Status Select -->
        <v-col cols="12" sm="2">
          <v-select
            v-model="localStatus"
            label="處理狀態"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            prepend-inner-icon="mdi-check-circle-outline"
            hide-details
            density="comfortable"
            variant="outlined"
          ></v-select>
        </v-col>

        <!-- Reset Button -->
        <v-col cols="12" sm="2" class="d-flex justify-end">
          <v-btn
            color="secondary"
            variant="tonal"
            prepend-icon="mdi-refresh"
            block
            height="48"
            @click="handleReset"
          >
            重設篩選
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
