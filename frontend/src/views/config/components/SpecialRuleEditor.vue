<script setup lang="ts">
import { computed } from 'vue';
import type { PythonFeature, SpecialRule } from '../../../types/config';

const pythonFeatures: PythonFeature[] = [
  'IF', 'FOR', 'WHILE', 'FUNCTION', 'NESTED_LOOP', 'RECURSION',
  'LAMBDA', 'LIST', 'DICT', 'SET', 'SORT', 'SORTED'
];
const ruleTypes = [
  { title: '正規表示式', value: 'regex' },
  { title: '指定文字', value: 'use' },
  { title: '複合規則', value: 'composite' },
  { title: '巢狀迴圈', value: 'nestedLoop' },
  { title: 'Python 語法', value: 'pythonFeature' }
];
const constraints = [
  { title: '必須包含', value: 'MUST_HAVE' },
  { title: '不得包含', value: 'MUST_NOT_HAVE' }
];
const severities = [
  { title: '提示', value: 'info' },
  { title: '警告', value: 'warn' }
];
const operators = [
  { title: '全部符合（AND）', value: 'AND' },
  { title: '任一符合（OR）', value: 'OR' }
];

const props = defineProps<{ modelValue?: SpecialRule[], disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const rules = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
});

const addRule = () => {
  const newRules = [...rules.value];
  newRules.push({
    id: `rule-${Date.now()}`,
    type: 'regex',
    constraint: 'MUST_HAVE',
    message: '',
    severity: 'warn',
    params: {}
  });
  emit('update:modelValue', newRules);
};

const removeRule = (index: number) => {
  const newRules = [...rules.value];
  newRules.splice(index, 1);
  emit('update:modelValue', newRules);
};

const onTypeChange = (rule: any) => {
  if (rule.type === 'use') {
    rule.params = { target: rule.params?.target || '' };
  } else if (rule.type === 'regex') {
    rule.params = { pattern: rule.params?.pattern || '' };
  } else if (rule.type === 'composite') {
    rule.params = { op: rule.params?.op || 'AND', rules: rule.params?.rules || [] };
  } else if (rule.type === 'pythonFeature') {
    rule.params = { features: rule.params?.features || [] };
  } else {
    rule.params = {};
  }
};
</script>

<template>
  <div>
    <v-btn v-if="!props.disabled" size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="addRule" class="mb-2">
      新增規則
    </v-btn>
    
    <v-card v-for="(rule, index) in rules" :key="index" variant="outlined" class="pa-2 mb-2">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-caption font-weight-bold">規則：{{ rule.id }}</span>
        <v-btn v-if="!props.disabled" size="x-small" icon="mdi-delete" color="error" variant="text" @click="removeRule(index)"></v-btn>
      </div>
      <v-row dense>
        <v-col cols="4">
          <v-select v-model="rule.type" :items="ruleTypes" label="類型" density="compact" hide-details :disabled="props.disabled" @update:model-value="onTypeChange(rule)"></v-select>
        </v-col>
        <v-col cols="4">
          <v-select v-model="rule.constraint" :items="constraints" label="條件" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <v-col cols="4">
          <v-select v-model="rule.severity" :items="severities" label="嚴重程度" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <v-col :cols="rule.type === 'composite' ? 6 : 9">
          <v-text-field v-model="rule.message" label="警告訊息" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="3" v-if="rule.type === 'composite'">
          <v-select v-model="rule.params.op" :items="operators" label="組合方式" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <!-- Params Editor -->
        <v-col cols="12" v-if="rule.type === 'use'">
          <v-text-field v-model="rule.params.target" label="目標程式碼文字" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="12" v-if="rule.type === 'regex'">
          <v-text-field v-model="rule.params.pattern" label="正規表示式" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="12" v-if="rule.type === 'composite'">
          <div class="text-caption font-weight-bold mb-1 ml-1">子規則</div>
          <SpecialRuleEditor v-model="rule.params.rules" :disabled="props.disabled" class="pl-4 ml-2 border-s-sm border-primary" />
        </v-col>
        <v-col cols="12" v-if="rule.type === 'pythonFeature'">
          <v-select v-model="rule.params.features" :items="pythonFeatures" label="必要的 Python 語法" multiple chips density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>
