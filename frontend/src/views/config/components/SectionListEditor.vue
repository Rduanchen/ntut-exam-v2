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
    title: '新區段',
    description: '',
    maxScore: 100,
    puzzles: []
  });
};

const removeSection = (index: number) => {
  if (confirm('確定要刪除此區段嗎？')) {
    sections.value.splice(index, 1);
  }
};
</script>

<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-h5">考試區段</h2>
      <v-btn v-if="!props.disabled" color="primary" prepend-icon="mdi-plus" @click="addSection">新增區段</v-btn>
    </div>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel v-for="(section, index) in sections" :key="section.id">
        <v-expansion-panel-title class="font-weight-bold">
          {{ section.title }} （分數：{{ section.maxScore }}）
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="mt-2">
            <v-col cols="4">
              <v-text-field v-model="section.id" label="區段 ID" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="section.title" label="標題" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="2">
              <v-text-field v-model.number="section.maxScore" type="number" label="最高分" outlined density="compact" :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="section.description" label="說明" outlined rows="2" density="compact" :readonly="props.disabled"></v-textarea>
            </v-col>
          </v-row>
          
          <v-divider class="my-4"></v-divider>
          
          <PuzzleListEditor v-model="section.puzzles" :disabled="props.disabled" />
          
          <div class="d-flex justify-end mt-4" v-if="!props.disabled">
            <v-btn color="error" variant="text" @click="removeSection(index)">刪除區段</v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    
    <v-alert v-if="!sections.length" type="info" class="mt-4" variant="tonal">
      尚未建立區段。請按「新增區段」。
    </v-alert>
  </div>
</template>
