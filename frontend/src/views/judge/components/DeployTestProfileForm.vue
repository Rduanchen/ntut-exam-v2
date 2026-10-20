<script setup lang="ts">
import { ref } from 'vue';
import type { DeploymentTestProfile, ProfileDescriptor } from '../../../types/deploy-test';

const props = defineProps<{ modelValue: DeploymentTestProfile; descriptor: ProfileDescriptor; loading: boolean; blocked: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: DeploymentTestProfile]; start: []; save: [] }>();
const confirming = ref(false);
const PHASE_LABELS = { smoke: '基本檢查', verdict: '評測結果', concurrency: '並行測試' } as const;
const update = <K extends keyof DeploymentTestProfile>(key: K, value: DeploymentTestProfile[K]) => emit('update:modelValue', { ...props.modelValue, [key]: value });
const levels = ref(props.modelValue.concurrencyLevels.join(', '));
const updateLevels = (value: string) => {
  levels.value = value;
  update('concurrencyLevels', value.split(',').map(Number).filter(Number.isFinite).sort((a, b) => a - b));
};
</script>

<template>
  <v-card class="mb-4" data-test="deploy-test-profile" @focusout="emit('save')"><v-card-title>測試設定檔</v-card-title><v-card-text>
    <v-checkbox-btn v-for="phase in ['smoke', 'verdict', 'concurrency'] as const" :key="phase" :label="PHASE_LABELS[phase]" :model-value="modelValue.phases.includes(phase)" @update:model-value="value => update('phases', value ? [...modelValue.phases, phase] : modelValue.phases.filter(item => item !== phase))" />
    <div class="text-caption mb-2">測試語言：C、C++、Python（由伺服器提供測試程式）</div>
    <v-text-field :model-value="levels" label="提交的並行數" hint="以逗號分隔；超過目前上限的工作會安全排隊" persistent-hint @update:model-value="updateLevels" />
    <v-number-input :model-value="modelValue.jobCount" label="測試工作總數" :min="descriptor.bounds.minJobs" :max="descriptor.bounds.maxJobs" @update:model-value="value => update('jobCount', Number(value))" />
    <v-number-input :model-value="modelValue.deadlineMs" label="截止時間（ms）" :min="descriptor.bounds.minDeadlineMs" :max="descriptor.bounds.maxDeadlineMs" @update:model-value="value => update('deadlineMs', Number(value))" />
    <div class="text-caption mb-2">欄位失去焦點時，測試設定草稿會儲存在此瀏覽器。</div>
    <v-alert v-if="!descriptor.canStart || blocked" type="warning" variant="tonal">無法開始： {{ descriptor.blockedReason ?? (blocked ? 'deploy_test_active_or_draining' : '') }}</v-alert>
    <v-btn color="primary" class="mt-3" data-test="deploy-test-start" :loading="loading" :disabled="!descriptor.canStart || blocked" @click="confirming = true">執行部署測試</v-btn>
  </v-card-text></v-card>
  <v-dialog v-model="confirming" max-width="520"><v-card><v-card-title>確認高負載測試</v-card-title>
    <v-card-text>此操作會執行真正的 C／C++／Python 程式，最多提交 {{ modelValue.jobCount }} 個工作。請只在考前執行。</v-card-text>
    <v-card-actions><v-spacer /><v-btn @click="confirming = false">取消</v-btn><v-btn color="primary" data-test="deploy-test-confirm" @click="confirming = false; emit('start')">確認並執行</v-btn></v-card-actions>
  </v-card></v-dialog>
</template>
