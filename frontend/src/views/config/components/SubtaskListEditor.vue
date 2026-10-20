<script setup lang="ts">
import { computed } from 'vue';
import type { SubTask } from '../../../types/config';
import TestCaseEditor from './TestCaseEditor.vue';

const props = defineProps<{ modelValue: SubTask[], disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const subtasks = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
});

const addSubtask = () => {
  subtasks.value.push({
    title: '新子題',
    score: 10,
    visible: [],
    hidden: []
  });
};

const removeSubtask = (index: number) => {
  if (confirm('確定要刪除此子題嗎？')) {
    subtasks.value.splice(index, 1);
  }
};
</script>

<template>
  <v-card variant="flat" border class="pa-3">
    <div class="d-flex justify-space-between align-center mb-3">
      <h4 class="text-subtitle-1 font-weight-bold">子題</h4>
      <v-btn v-if="!props.disabled" size="small" color="info" prepend-icon="mdi-plus" @click="addSubtask" variant="tonal">新增子題</v-btn>
    </div>

    <v-card v-for="(subtask, index) in subtasks" :key="index" variant="outlined" class="mb-4 pa-3 border">
      <div class="d-flex align-center justify-space-between mb-3">
        <div class="d-flex align-center" style="width: 80%;">
          <v-text-field v-model="subtask.title" label="子題標題" density="compact" hide-details class="mr-2"></v-text-field>
          <v-text-field v-model.number="subtask.score" type="number" label="分數" density="compact" hide-details style="max-width: 150px;"></v-text-field>
        </div>
        <v-btn v-if="!props.disabled" icon="mdi-delete" size="small" color="error" variant="text" @click="removeSubtask(index)"></v-btn>
      </div>

      <v-row>
        <v-col cols="12" md="6">
          <TestCaseEditor v-model="subtask.visible" title="公開測資" :disabled="props.disabled" />
        </v-col>
        <v-col cols="12" md="6">
          <TestCaseEditor v-model="subtask.hidden" title="隱藏測資" :disabled="props.disabled" />
        </v-col>
      </v-row>
    </v-card>

    <div v-if="!subtasks.length" class="text-caption text-medium-emphasis">
      尚未新增子題。
    </div>
  </v-card>
</template>
