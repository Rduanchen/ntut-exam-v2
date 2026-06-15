<script setup lang="ts">
import { computed } from 'vue';
import type { Section } from '../../../types/config';
import PuzzleListEditor from './PuzzleListEditor.vue';

const props = defineProps<{ modelValue: Section[], disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const sections = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
});

const addSection = () => {
  sections.value.push({
    id: `sec-${Date.now()}`,
    title: 'New Section',
    description: '',
    maxScore: 100,
    puzzles: []
  });
};

const removeSection = (index: number) => {
  if (confirm('Are you sure you want to delete this section?')) {
    sections.value.splice(index, 1);
  }
};
</script>

<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-h5">Exam Sections</h2>
      <v-btn v-if="!props.disabled" color="primary" prepend-icon="mdi-plus" @click="addSection">Add Section</v-btn>
    </div>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel v-for="(section, index) in sections" :key="section.id">
        <v-expansion-panel-title class="font-weight-bold">
          {{ section.title }} (Score: {{ section.maxScore }})
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="mt-2">
            <v-col cols="4">
              <v-text-field v-model="section.id" label="Section ID" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="section.title" label="Title" outlined density="compact"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model.number="section.maxScore" type="number" label="Max Score" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="section.description" label="Description" outlined rows="2" density="compact"></v-textarea>
            </v-col>
          </v-row>
          
          <v-divider class="my-4"></v-divider>
          
          <PuzzleListEditor v-model="section.puzzles" :disabled="props.disabled" />
          
          <div class="d-flex justify-end mt-4" v-if="!props.disabled">
            <v-btn color="error" variant="text" @click="removeSection(index)">Delete Section</v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    
    <v-alert v-if="!sections.length" type="info" class="mt-4" variant="tonal">
      No sections defined yet. Click "Add Section" to create one.
    </v-alert>
  </div>
</template>
