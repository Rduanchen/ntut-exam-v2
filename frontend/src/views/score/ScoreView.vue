<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useScoreStore } from '../../stores/score.store';
import { useConfigStore } from '../../stores/config.store';
import ScoreTable from './components/ScoreTable.vue';
import SubmissionModal from './components/SubmissionModal.vue';

const scoreStore = useScoreStore();
const configStore = useConfigStore();

const search = ref('');
const selectedScore = ref<any>(null);
const showModal = ref(false);

onMounted(async () => {
  await Promise.all([
    configStore.fetchConfig(),
    scoreStore.fetchScores()
  ]);
});

// Prepare student score items by flattening nested user properties
const items = computed(() => {
  return scoreStore.scores.map(scoreRecord => {
    const row: any = { ...scoreRecord };
    
    // Flatten user properties for table columns and Excel copy resolution
    if (scoreRecord.user) {
      row['user.testId'] = scoreRecord.user.testId;
      row['user.name'] = scoreRecord.user.name;
    }
    
    return row;
  });
});

const openModal = (item: any) => {
  selectedScore.value = item;
  showModal.value = true;
};
</script>

<template>
  <v-container fluid class="pa-6">
    <v-row class="mb-4 align-center justify-space-between">
      <v-col>
        <h1 class="text-h4 font-weight-bold">成績看板</h1>
        <p class="text-subtitle-1 text-medium-emphasis">檢視所有學生的作答狀態、子任務（測資組）得分與詳細作答紀錄</p>
      </v-col>
      <v-col cols="auto">
        <v-btn
          color="primary"
          prepend-icon="mdi-refresh"
          @click="scoreStore.fetchScores"
          :loading="scoreStore.loading"
        >
          重新整理
        </v-btn>
      </v-col>
    </v-row>

    <!-- Score Table with Multi-level headers and Excel Copy -->
    <ScoreTable
      :items="items"
      :config="configStore.config"
      :loading="scoreStore.loading || configStore.loading"
      v-model:search="search"
      @click-row="openModal"
    />

    <!-- Submission Details Modal -->
    <SubmissionModal 
      v-model="showModal" 
      :score-record="selectedScore" 
      :exam-config="configStore.config" 
    />
  </v-container>
</template>
