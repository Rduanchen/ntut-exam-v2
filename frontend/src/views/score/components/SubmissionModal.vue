<script setup lang="ts">
import { computed, ref } from 'vue';

import SubmissionDetails from '../../../components/SubmissionDetails.vue';

const props = defineProps<{
  modelValue: boolean;
  scoreRecord: any;
  examConfig: any;
}>();

const emit = defineEmits(['update:modelValue']);

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const isLocked = ref(true);
</script>

<template>
  <v-dialog v-model="show" max-width="1200px" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between bg-primary text-white">
        <span>提交詳情： {{ scoreRecord?.user?.name }} ({{ scoreRecord?.user?.testId }})</span>
        <v-btn icon="mdi-close" variant="text" @click="show = false"></v-btn>
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="pa-4 bg-grey-lighten-4" style="height: 600px;">
        <SubmissionDetails :scoreRecord="scoreRecord" :examConfig="examConfig" v-model:isLocked="isLocked" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
