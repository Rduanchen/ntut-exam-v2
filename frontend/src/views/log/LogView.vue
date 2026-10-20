<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLogStore } from '../../stores/log.store';
import LogFilterBar from './components/LogFilterBar.vue';
import LogTable from './components/LogTable.vue';

const logStore = useLogStore();

// Filter States
const search = ref('');
const ip = ref('');
const studentId = ref('');

onMounted(() => {
  logStore.fetchLogs();
});

// Client-side filtering logic
const filteredLogs = computed(() => {
  return logStore.logs.filter((log) => {
    // Filter by studentId (學號)
    if (studentId.value && !log.testId?.toLowerCase().includes(studentId.value.toLowerCase())) {
      return false;
    }
    // Filter by IP Address
    if (ip.value && !log.ipAddress?.toLowerCase().includes(ip.value.toLowerCase())) {
      return false;
    }
    // Filter by keyword (actionType or details)
    if (search.value) {
      const q = search.value.toLowerCase();
      const matchType = log.actionType?.toLowerCase().includes(q);
      const matchDetails = log.details?.toLowerCase().includes(q);
      if (!matchType && !matchDetails) {
        return false;
      }
    }
    return true;
  });
});

const handleReset = () => {
  search.value = '';
  ip.value = '';
  studentId.value = '';
};

const handleRefresh = () => {
  logStore.fetchLogs();
};
</script>

<template>
  <v-container fluid class="pa-6">
    <v-row class="mb-4" align="center" justify="space-between">
      <v-col cols="auto">
        <h1 class="text-h4 font-weight-bold">系統操作紀錄</h1>
        <p class="text-subtitle-1 text-medium-emphasis">檢視並搜尋所有學生的操作與系統日誌記錄</p>
      </v-col>
      <v-col cols="auto">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="logStore.loading"
          @click="handleRefresh"
        >
          重新整理
        </v-btn>
      </v-col>
    </v-row>

    <!-- Error Alert -->
    <v-alert v-if="logStore.error" type="error" closable class="mb-6">
      {{ logStore.error }}
    </v-alert>

    <!-- Top Filter Bar -->
    <LogFilterBar
      v-model:search="search"
      v-model:ip="ip"
      v-model:studentId="studentId"
      @reset="handleReset"
    />

    <!-- Logs Data Table -->
    <LogTable
      :items="filteredLogs"
      :loading="logStore.loading"
    />
  </v-container>
</template>
