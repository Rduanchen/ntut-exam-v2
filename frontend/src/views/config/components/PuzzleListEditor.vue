<script setup lang="ts">
import { computed } from 'vue';
import type { Puzzle } from '../../../types/config';
import SubtaskListEditor from './SubtaskListEditor.vue';
import SpecialRuleEditor from './SpecialRuleEditor.vue';

const props = defineProps<{ modelValue: Puzzle[], disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const puzzles = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
});

const addPuzzle = () => {
  puzzles.value.push({
    id: `puz-${Date.now()}`,
    title: '新題目',
    score: 10,
    multiplier: 0.5,
    language: 'c', // Default language
    subtasks: []
  });
};

const removePuzzle = (index: number) => {
  if (confirm('確定要刪除此題目嗎？')) {
    puzzles.value.splice(index, 1);
  }
};

const checkMemoryLimit = (val: any) => {
  const num = Number(val);
  if (!isNaN(num) && num > 1024) {
    alert("提醒：記憶體限制超過 1GB (1024MB)！請確認您輸入的單位為 MB 而非 Bytes。");
  }
};
</script>

<template>
  <v-card variant="outlined" class="pa-3 mb-3">
    <div class="d-flex justify-space-between align-center mb-3">
      <h3 class="text-h6">題目</h3>
      <v-btn v-if="!props.disabled" size="small" color="secondary" prepend-icon="mdi-plus" @click="addPuzzle">新增題目</v-btn>
    </div>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel v-for="(puzzle, index) in puzzles" :key="puzzle.id">
        <v-expansion-panel-title>
          {{ puzzle.title }}（{{ puzzle.language }}）— 分數：{{ puzzle.score }}
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="mt-2">
            <v-col cols="3">
              <v-text-field v-model="puzzle.id" label="題目 ID" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="5">
              <v-text-field v-model="puzzle.title" label="標題" outlined density="compact"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model.number="puzzle.score" type="number" label="分數" outlined density="compact"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model="puzzle.language" label="程式語言" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model.number="puzzle.timeLimit" type="number" label="時間限制（ms，選填）" outlined density="compact" hide-details></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model.number="puzzle.memoryLimit" @update:model-value="checkMemoryLimit" type="number" label="記憶體限制（MB，選填）" outlined density="compact" hide-details></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field :model-value="puzzle.multiplier ?? 0.5" @update:model-value="puzzle.multiplier = Number($event)" type="number" step="0.1" min="0" max="1" label="規則扣分倍率" outlined density="compact" hide-details></v-text-field>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>
          
          <SubtaskListEditor v-model="puzzle.subtasks" :disabled="props.disabled" />
          
          <v-divider class="my-4"></v-divider>
          
          <h4 class="text-subtitle-1 mb-2">特殊規則（選填）</h4>
          <SpecialRuleEditor v-model="puzzle.specialRules" />

          <div class="d-flex justify-end mt-4" v-if="!props.disabled">
            <v-btn color="error" variant="text" size="small" @click="removePuzzle(index)">刪除題目</v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    
    <div v-if="!puzzles.length" class="text-caption text-medium-emphasis mt-2">
      尚未新增題目。
    </div>
  </v-card>
</template>
