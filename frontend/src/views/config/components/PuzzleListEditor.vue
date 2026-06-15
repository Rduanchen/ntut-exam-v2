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
    title: 'New Puzzle',
    score: 10,
    language: 'c', // Default language
    subtasks: []
  });
};

const removePuzzle = (index: number) => {
  if (confirm('Delete this puzzle?')) {
    puzzles.value.splice(index, 1);
  }
};
</script>

<template>
  <v-card variant="outlined" class="pa-3 mb-3">
    <div class="d-flex justify-space-between align-center mb-3">
      <h3 class="text-h6">Puzzles</h3>
      <v-btn v-if="!props.disabled" size="small" color="secondary" prepend-icon="mdi-plus" @click="addPuzzle">Add Puzzle</v-btn>
    </div>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel v-for="(puzzle, index) in puzzles" :key="puzzle.id">
        <v-expansion-panel-title>
          {{ puzzle.title }} ({{ puzzle.language }}) - Score: {{ puzzle.score }}
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="mt-2">
            <v-col cols="3">
              <v-text-field v-model="puzzle.id" label="Puzzle ID" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="5">
              <v-text-field v-model="puzzle.title" label="Title" outlined density="compact"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model.number="puzzle.score" type="number" label="Score" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model="puzzle.language" label="Language" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="puzzle.timeLimit" type="number" label="Time Limit (ms, optional)" outlined density="compact" hide-details></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="puzzle.memoryLimit" type="number" label="Memory Limit (MB, optional)" outlined density="compact" hide-details></v-text-field>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>
          
          <SubtaskListEditor v-model="puzzle.subtasks" :disabled="props.disabled" />
          
          <v-divider class="my-4"></v-divider>
          
          <h4 class="text-subtitle-1 mb-2">Special Rules (Optional)</h4>
          <SpecialRuleEditor v-model="puzzle.specialRules" :disabled="props.disabled" />

          <div class="d-flex justify-end mt-4" v-if="!props.disabled">
            <v-btn color="error" variant="text" size="small" @click="removePuzzle(index)">Delete Puzzle</v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    
    <div v-if="!puzzles.length" class="text-caption text-medium-emphasis mt-2">
      No puzzles added yet.
    </div>
  </v-card>
</template>
