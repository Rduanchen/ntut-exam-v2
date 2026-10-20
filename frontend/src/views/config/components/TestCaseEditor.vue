<script setup lang="ts">
import { computed } from 'vue';
import type { TestCase } from '../../../types/config';

const props = defineProps<{ modelValue: TestCase[], title: string, disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const testcases = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
});

const addTestCase = () => {
  testcases.value.push({ input: '', output: '' });
};

const removeTestCase = (index: number) => {
  testcases.value.splice(index, 1);
};
</script>

<template>
  <div class="testcase-editor">
    <div class="d-flex justify-space-between align-center mb-2">
      <span class="text-subtitle-2">{{ title }}</span>
      <v-btn v-if="!props.disabled" size="x-small" icon="mdi-plus" color="primary" variant="text" @click="addTestCase"></v-btn>
    </div>
    
    <div v-for="(tc, index) in testcases" :key="index" class="d-flex align-start mb-2">
      <v-textarea v-model="tc.input" label="輸入" density="compact" rows="1" auto-grow hide-details class="mr-1"></v-textarea>
      <v-textarea v-model="tc.output" label="輸出" density="compact" rows="1" auto-grow hide-details class="mr-1"></v-textarea>
      <v-btn v-if="!props.disabled" size="small" icon="mdi-close" color="error" variant="text" @click="removeTestCase(index)" class="mt-1"></v-btn>
    </div>
    
    <div v-if="!testcases.length" class="text-caption text-medium-emphasis">尚無測資。</div>
  </div>
</template>
