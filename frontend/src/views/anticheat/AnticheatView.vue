<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAnticheatStore } from '../../stores/anticheat.store';
import CheatSummaryStats from './components/CheatSummaryStats.vue';
import AnticheatFilterBar from './components/AnticheatFilterBar.vue';
import AnticheatTable from './components/AnticheatTable.vue';

const anticheatStore = useAnticheatStore();

// Filter States
const studentId = ref('');
const ip = ref('');
const type = ref('ALL');
const status = ref('ALL');

onMounted(() => {
  anticheatStore.fetchAlerts();
});

// Client-side filtering logic
const filteredAlerts = computed(() => {
  return anticheatStore.alerts.filter((alert) => {
    // Filter by studentId
    if (studentId.value && !alert.testId?.toLowerCase().includes(studentId.value.toLowerCase())) {
      return false;
    }
    // Filter by IP Address
    if (ip.value && !alert.ipAddress?.toLowerCase().includes(ip.value.toLowerCase())) {
      return false;
    }
    // Filter by warning type
    if (type.value && type.value !== 'ALL' && alert.type !== type.value) {
      return false;
    }
    // Filter by resolution status (isOk)
    if (status.value && status.value !== 'ALL') {
      if (status.value === 'RESOLVED' && !alert.isOk) return false;
      if (status.value === 'UNRESOLVED' && alert.isOk) return false;
    }
    return true;
  });
});

const handleReset = () => {
  studentId.value = '';
  ip.value = '';
  type.value = 'ALL';
  status.value = 'ALL';
};

const handleRefresh = () => {
  anticheatStore.fetchAlerts();
};
</script>

<template>
  <v-container fluid class="pa-6">
    <v-row class="mb-4" align="center" justify="space-between">
      <v-col cols="auto">
        <h1 class="text-h4 font-weight-bold">防作弊監控面板</h1>
        <p class="text-subtitle-1 text-medium-emphasis">即時監控所有學生的異常行為警告與操作紀錄</p>
      </v-col>
      <v-col cols="auto">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="anticheatStore.loading"
          @click="handleRefresh"
        >
          重新整理
        </v-btn>
      </v-col>
    </v-row>

    <!-- Summary Statistics Cards -->
    <CheatSummaryStats :alerts="anticheatStore.alerts" />

    <!-- Error Alert -->
    <v-alert v-if="anticheatStore.error" type="error" closable class="mb-6">
      {{ anticheatStore.error }}
    </v-alert>

    <!-- Filters Bar -->
    <AnticheatFilterBar
      v-model:student-id="studentId"
      v-model:ip="ip"
      v-model:type="type"
      v-model:status="status"
      @reset="handleReset"
    />

    <!-- Alerts Data Table -->
    <AnticheatTable
      :items="filteredAlerts"
      :loading="anticheatStore.loading"
    />
  </v-container>
</template>
