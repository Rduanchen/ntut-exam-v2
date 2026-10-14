<script setup lang="ts">
import { computed } from 'vue';
import type { PythonFeature, SpecialRule } from '../../../types/config';

const pythonFeatures: PythonFeature[] = [
  'IF', 'FOR', 'WHILE', 'FUNCTION', 'NESTED_LOOP', 'RECURSION',
  'LAMBDA', 'LIST', 'DICT', 'SET', 'SORT', 'SORTED'
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
    multiplier: 1,
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
      Add Rule
    </v-btn>
    
    <v-card v-for="(rule, index) in rules" :key="index" variant="outlined" class="pa-2 mb-2">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-caption font-weight-bold">Rule: {{ rule.id }}</span>
        <v-btn v-if="!props.disabled" size="x-small" icon="mdi-delete" color="error" variant="text" @click="removeRule(index)"></v-btn>
      </div>
      <v-row dense>
        <v-col cols="4">
          <v-select v-model="rule.type" :items="['regex', 'use', 'composite', 'nestedLoop', 'pythonFeature']" label="Type" density="compact" hide-details :disabled="props.disabled" @update:model-value="onTypeChange(rule)"></v-select>
        </v-col>
        <v-col cols="4">
          <v-select v-model="rule.constraint" :items="['MUST_HAVE', 'MUST_NOT_HAVE']" label="Constraint" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <v-col cols="4">
          <v-select v-model="rule.severity" :items="['info', 'warn']" label="Severity" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <v-col :cols="rule.type === 'composite' ? 6 : 9">
          <v-text-field v-model="rule.message" label="Warning Message" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="3" v-if="rule.type === 'composite'">
          <v-select v-model="rule.params.op" :items="['AND', 'OR']" label="Combine" density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
        <v-col cols="3">
          <v-text-field v-model.number="rule.multiplier" type="number" step="0.1" min="0" max="1" label="Multiplier" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <!-- Params Editor -->
        <v-col cols="12" v-if="rule.type === 'use'">
          <v-text-field v-model="rule.params.target" label="Target Code String" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="12" v-if="rule.type === 'regex'">
          <v-text-field v-model="rule.params.pattern" label="Regex Pattern" density="compact" hide-details :readonly="props.disabled"></v-text-field>
        </v-col>
        <v-col cols="12" v-if="rule.type === 'composite'">
          <div class="text-caption font-weight-bold mb-1 ml-1">Sub Rules</div>
          <SpecialRuleEditor v-model="rule.params.rules" :disabled="props.disabled" class="pl-4 ml-2 border-s-sm border-primary" />
        </v-col>
        <v-col cols="12" v-if="rule.type === 'pythonFeature'">
          <v-select v-model="rule.params.features" :items="pythonFeatures" label="Required Python Features" multiple chips density="compact" hide-details :disabled="props.disabled"></v-select>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>
