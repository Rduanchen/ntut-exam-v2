<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  search: string;
  ip: string;
  studentId: string;
}>();

const emit = defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'update:ip', value: string): void;
  (e: 'update:studentId', value: string): void;
  (e: 'reset'): void;
}>();

const localSearch = ref(props.search);
const localIp = ref(props.ip);
const localStudentId = ref(props.studentId);

watch(() => props.search, (newVal) => { localSearch.value = newVal; });
watch(() => props.ip, (newVal) => { localIp.value = newVal; });
watch(() => props.studentId, (newVal) => { localStudentId.value = newVal; });

watch(localSearch, (newVal) => { emit('update:search', newVal); });
watch(localIp, (newVal) => { emit('update:ip', newVal); });
watch(localStudentId, (newVal) => { emit('update:studentId', newVal); });

const handleReset = () => {
  localSearch.value = '';
  localIp.value = '';
  localStudentId.value = '';
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

        <!-- Keyword Search -->
        <v-col cols="12" sm="4">
          <v-text-field
            v-model="localSearch"
            label="關鍵字（類型／詳情）"
            prepend-inner-icon="mdi-magnify"
            placeholder="搜尋動作類型或詳細內容..."
            hide-details
            clearable
            density="comfortable"
            variant="outlined"
          ></v-text-field>
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
            重設
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
