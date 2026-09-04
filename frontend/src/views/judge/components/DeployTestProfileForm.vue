<script setup lang="ts">
import { ref } from 'vue';
import type { DeploymentTestProfile, ProfileDescriptor } from '../../../types/deploy-test';

const props = defineProps<{ modelValue: DeploymentTestProfile; descriptor: ProfileDescriptor; loading: boolean; blocked: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: DeploymentTestProfile]; start: []; save: [] }>();
const confirming = ref(false);
const update = <K extends keyof DeploymentTestProfile>(key: K, value: DeploymentTestProfile[K]) => emit('update:modelValue', { ...props.modelValue, [key]: value });
const levels = ref(props.modelValue.concurrencyLevels.join(', '));
const updateLevels = (value: string) => {
  levels.value = value;
  update('concurrencyLevels', value.split(',').map(Number).filter(Number.isFinite).sort((a, b) => a - b));
};
</script>

<template>
  <v-card class="mb-4" data-test="deploy-test-profile" @focusout="emit('save')"><v-card-title>Test profile</v-card-title><v-card-text>
    <v-checkbox-btn v-for="phase in ['smoke', 'verdict', 'concurrency'] as const" :key="phase" :label="phase" :model-value="modelValue.phases.includes(phase)" @update:model-value="value => update('phases', value ? [...modelValue.phases, phase] : modelValue.phases.filter(item => item !== phase))" />
    <div class="text-caption mb-2">Languages: C, C++, Python (server-owned probes)</div>
    <v-text-field :model-value="levels" label="Submitted concurrency levels" hint="Comma separated; excess above the active ceiling queues safely" persistent-hint @update:model-value="updateLevels" />
    <v-number-input :model-value="modelValue.jobCount" label="Total synthetic jobs" :min="descriptor.bounds.minJobs" :max="descriptor.bounds.maxJobs" @update:model-value="value => update('jobCount', Number(value))" />
    <v-number-input :model-value="modelValue.deadlineMs" label="Deadline (ms)" :min="descriptor.bounds.minDeadlineMs" :max="descriptor.bounds.maxDeadlineMs" @update:model-value="value => update('deadlineMs', Number(value))" />
    <div class="text-caption mb-2">The test profile draft is saved in this browser when a field loses focus.</div>
    <v-alert v-if="!descriptor.canStart || blocked" type="warning" variant="tonal">Cannot start: {{ descriptor.blockedReason ?? (blocked ? 'deploy_test_active_or_draining' : '') }}</v-alert>
    <v-btn color="primary" class="mt-3" data-test="deploy-test-start" :loading="loading" :disabled="!descriptor.canStart || blocked" @click="confirming = true">Run deployment test</v-btn>
  </v-card-text></v-card>
  <v-dialog v-model="confirming" max-width="520"><v-card><v-card-title>Confirm resource-intensive test</v-card-title>
    <v-card-text>This runs real C/C++/Python programs and may submit {{ modelValue.jobCount }} jobs. Run it only before an exam.</v-card-text>
    <v-card-actions><v-spacer /><v-btn @click="confirming = false">Cancel</v-btn><v-btn color="primary" data-test="deploy-test-confirm" @click="confirming = false; emit('start')">Confirm and run</v-btn></v-card-actions>
  </v-card></v-dialog>
</template>
