<script setup lang="ts">
import { verdictLabel } from '../utils/presentation-labels';
import { computed, ref } from 'vue';

const props = defineProps<{
  scoreRecord: any;
  examConfig: any;
  isLocked?: boolean;
}>();

const emit = defineEmits(['update:isLocked']);

const internalLocked = ref(true);

const locked = computed({
  get: () => props.isLocked !== undefined ? props.isLocked : internalLocked.value,
  set: (val) => {
    if (props.isLocked !== undefined) {
      emit('update:isLocked', val);
    } else {
      internalLocked.value = val;
    }
  }
});

const statusColor = (status: string) => {
  if (status === 'AC') return 'success';
  if (status === 'WA') return 'error';
  if (status === 'TLE' || status === 'MLE') return 'warning';
  return 'grey';
};

const getSpecialRuleColor = (ruleResult: any) => {
  if (ruleResult.passed) return 'success';
  return 'error';
};

const getPuzzleGlobalIndex = (puzzleId: string) => {
  if (!props.examConfig?.sections) return -1;
  return props.examConfig.sections.flatMap((s: any) => s.puzzles || []).findIndex((p: any) => p.id === puzzleId);
};

const getPuzzleResult = (puzzleId: string) => {
  if (!props.scoreRecord?.puzzleResults) return null;
  let res = props.scoreRecord.puzzleResults[puzzleId];
  if (!res) {
    const idx = getPuzzleGlobalIndex(puzzleId);
    if (idx !== -1) res = props.scoreRecord.puzzleResults[`Q${idx + 1}`];
  }
  return res;
};

const checkSubtaskPassed = (stRes: any, subtask: any) => {
  if (!stRes) return false;
  
  const allVisible = subtask.visible?.length > 0 
    ? subtask.visible.every((_: any, i: number) => stRes.visible && (stRes.visible[i]?.status || stRes.visible[i]?.statusCode) === 'AC') 
    : true;
    
  const allHidden = subtask.hidden?.length > 0 
    ? subtask.hidden.every((_: any, i: number) => stRes.hidden && (stRes.hidden[i]?.status || stRes.hidden[i]?.statusCode) === 'AC') 
    : true;
    
  return allVisible && allHidden;
};

const getStatus = (tcRes: any) => {
  return tcRes?.status || tcRes?.statusCode || '';
};
</script>

<template>
  <div class="h-100 d-flex flex-column submission-details">
    <div class="d-flex justify-end mb-4 flex-shrink-0">
      <v-btn
        :color="locked ? 'error' : 'success'"
        :prepend-icon="locked ? 'mdi-lock' : 'mdi-lock-open'"
        variant="tonal"
        @click="locked = !locked"
      >
        {{ locked ? '解鎖輸出 (隱藏中)' : '鎖定輸出 (顯示中)' }}
      </v-btn>
    </div>

    <div v-if="!scoreRecord || !examConfig" class="text-center pa-8 text-medium-emphasis">
      沒有評測結果資料
    </div>
    
    <div v-else class="flex-grow-1 overflow-y-auto pr-2 pb-4 min-h-0">
      <template v-for="(section, sIdx) in examConfig.sections" :key="'section-'+sIdx">
        <div class="mb-8">
          <h1 class="text-h4 font-weight-bold mb-4 text-primary d-flex align-center">
            區段 {{ Number(sIdx) + 1 }}：{{ section.title }}
            <v-chip class="ml-4 font-weight-bold" color="primary" variant="flat">
              總分: {{ section.maxScore }}
            </v-chip>
          </h1>
          <v-divider class="mb-6"></v-divider>

          <template v-for="(puzzle, pIdx) in section.puzzles" :key="'puzzle-'+pIdx">
            <div class="mb-8 pl-4 border-s-lg border-primary">
              <h2 class="text-h5 font-weight-bold mb-3 d-flex align-center">
                {{ puzzle.title }}
                <v-chip class="ml-3 font-weight-bold" color="secondary" variant="flat" size="small">
                  配分: {{ puzzle.score }}
                </v-chip>
              </h2>
              
              <template v-if="getPuzzleResult(puzzle.id)">
                <div v-if="getPuzzleResult(puzzle.id).specialRuleResults?.length" class="mb-4">
                  <h3 class="text-subtitle-1 font-weight-bold mb-2">特殊規則</h3>
                  <v-card variant="outlined" class="bg-grey-lighten-4">
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item v-for="(sr, srIdx) in getPuzzleResult(puzzle.id).specialRuleResults" :key="'sr-'+srIdx">
                        <template v-slot:prepend>
                          <v-icon :color="getSpecialRuleColor(sr)" class="mr-2">
                            {{ sr.passed ? 'mdi-check-circle' : 'mdi-close-circle' }}
                          </v-icon>
                        </template>
                        <v-list-item-title class="font-weight-medium" :class="sr.passed ? 'text-success' : 'text-error'">
                          {{ sr.message }}
                        </v-list-item-title>
                        <v-list-item-subtitle v-if="sr.reason" class="mt-1 text-wrap">
                          {{ sr.reason }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </div>

                <div v-if="puzzle.subtasks?.length" class="d-flex flex-column gap-4">
                  <v-card v-for="(subtask, stIdx) in puzzle.subtasks" :key="'st-'+stIdx" border elevation="0" class="overflow-hidden">
                    <v-card-title class="bg-grey-lighten-3 d-flex align-center py-2 px-4 text-wrap">
                      <span class="text-subtitle-1 font-weight-bold mr-2">
                        子任務 {{ Number(stIdx) + 1 }}: {{ subtask.title }} (配分: {{ subtask.score }})
                      </span>
                      <v-spacer></v-spacer>
                      <v-chip
                        :color="checkSubtaskPassed(getPuzzleResult(puzzle.id).subtasks?.[stIdx], subtask) ? 'success' : 'error'"
                        size="small"
                        class="font-weight-bold"
                      >
                        {{ checkSubtaskPassed(getPuzzleResult(puzzle.id).subtasks?.[stIdx], subtask) ? '通過' : '未通過' }}
                      </v-chip>
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <v-table density="compact" hover>
                        <thead>
                          <tr>
                            <th class="font-weight-bold bg-grey-lighten-4" style="width: 80px">類型</th>
                            <th class="font-weight-bold bg-grey-lighten-4" style="width: 100px">狀態</th>
                            <th class="font-weight-bold bg-grey-lighten-4" style="width: 25%">輸入</th>
                            <th class="font-weight-bold bg-grey-lighten-4" style="width: 25%">預期輸出</th>
                            <th class="font-weight-bold bg-grey-lighten-4" style="width: 25%">實際輸出</th>
                          </tr>
                        </thead>
                        <tbody>
                          <!-- Visible Testcases -->
                          <template v-for="(tc, tcIdx) in subtask.visible" :key="'tc-v-'+tcIdx">
                            <tr v-if="getPuzzleResult(puzzle.id).subtasks?.[stIdx]?.visible?.[tcIdx]">
                              <td><v-chip size="x-small" color="info">公開測資</v-chip></td>
                              <td>
                                <v-chip size="small" :color="statusColor(getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx]))" variant="flat" class="font-weight-bold">
                                  {{ getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx]) }}（{{ verdictLabel(getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx])) }}）
                                </v-chip>
                                <div class="text-caption mt-1 text-grey-darken-1">{{ getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].time }}s / {{ (getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].memory / 1024 / 1024).toFixed(1) }}MB</div>
                              </td>
                              <td><pre class="tc-pre">{{ tc.input }}</pre></td>
                              <td>
                                <pre v-if="!locked" class="tc-pre">{{ tc.output }}</pre>
                                <div v-else class="text-medium-emphasis font-italic mt-2">********</div>
                              </td>
                              <td>
                                <pre v-if="!locked" class="tc-pre" :class="{ 'text-error': getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx]) !== 'AC' }">{{ getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].userOutput || getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].stdout || getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].stderr || getPuzzleResult(puzzle.id).subtasks[stIdx].visible[tcIdx].error || '' }}</pre>
                                <div v-else class="text-medium-emphasis font-italic mt-2">********</div>
                              </td>
                            </tr>
                          </template>
                          
                          <!-- Hidden Testcases -->
                          <template v-for="(tc, tcIdx) in subtask.hidden" :key="'tc-h-'+tcIdx">
                            <tr v-if="getPuzzleResult(puzzle.id).subtasks?.[stIdx]?.hidden?.[tcIdx]">
                              <td><v-chip size="x-small" color="grey">隱藏測資</v-chip></td>
                              <td>
                                <v-chip size="small" :color="statusColor(getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx]))" variant="flat" class="font-weight-bold">
                                  {{ getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx]) }}（{{ verdictLabel(getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx])) }}）
                                </v-chip>
                                <div class="text-caption mt-1 text-grey-darken-1">{{ getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].time }}s / {{ (getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].memory / 1024 / 1024).toFixed(1) }}MB</div>
                              </td>
                              <td><pre class="tc-pre">{{ tc.input }}</pre></td>
                              <td>
                                <pre v-if="!locked" class="tc-pre">{{ tc.output }}</pre>
                                <div v-else class="text-medium-emphasis font-italic mt-2">********</div>
                              </td>
                              <td>
                                <pre v-if="!locked" class="tc-pre" :class="{ 'text-error': getStatus(getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx]) !== 'AC' }">{{ getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].userOutput || getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].stdout || getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].stderr || getPuzzleResult(puzzle.id).subtasks[stIdx].hidden[tcIdx].error || '' }}</pre>
                                <div v-else class="text-medium-emphasis font-italic mt-2">********</div>
                              </td>
                            </tr>
                          </template>
                        </tbody>
                      </v-table>
                    </v-card-text>
                  </v-card>
                </div>
              </template>
              <div v-else class="text-medium-emphasis mt-2 pl-2 border-s">
                無此題目的評測紀錄
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.submission-details {
  min-height: 0;
}
.gap-4 {
  gap: 16px;
}
.tc-pre {
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: pre-wrap;
  max-height: 150px;
  overflow-y: auto;
  margin: 4px 0;
}
</style>
