<script setup lang="ts">
import { onMounted } from 'vue';
import { useManageStore } from '../../stores/manage.store';
import ExamStateControls from './components/ExamStateControls.vue';
import MessageBroadcastForm from './components/MessageBroadcastForm.vue';
import StudentReadiness from './components/StudentReadiness.vue';

const manageStore = useManageStore();

onMounted(() => {
  manageStore.fetchExamState();
});
</script>

<template>
  <v-container fluid class="pa-6">
    <v-row class="mb-4">
      <v-col cols="12">
        <h1 class="text-h4 font-weight-bold">考試管理</h1>
        <p class="text-subtitle-1 text-medium-emphasis">管理考試階段並廣播訊息</p>
      </v-col>
    </v-row>

    <v-alert v-if="manageStore.error" type="error" closable class="mb-6">
      {{ manageStore.error }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="8">
        <ExamStateControls />
      </v-col>
      <v-col cols="12" lg="4">
        <MessageBroadcastForm />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <StudentReadiness />
      </v-col>
    </v-row>
  </v-container>
</template>
