<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import type { ExamConfig } from '../../../types/config';
import SpecialRuleEditor from './SpecialRuleEditor.vue';

const showCsvDialog = ref(false);
const csvText = ref('');

const props = defineProps<{ modelValue: ExamConfig, disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);

const config = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

onMounted(() => {
  if (config.value && config.value.judgerSettings) {
    if (!config.value.judgerSettings.compareMode) {
      config.value.judgerSettings.compareMode = 'loose';
    }
  }
  if (config.value) {
    if (!config.value.environmentVariables) {
      config.value.environmentVariables = { startPassword: '' };
    } else if (config.value.environmentVariables.startPassword === undefined) {
      config.value.environmentVariables.startPassword = '';
    }
  }
});

const addEnvVar = () => {
  if (!config.value.environmentVariables) {
    config.value.environmentVariables = { startPassword: '' };
  }
  config.value.environmentVariables[`VAR_${Date.now()}`] = 'value';
};

const removeEnvVar = (key: string) => {
  if (config.value.environmentVariables) {
    delete config.value.environmentVariables[key];
  }
};

const updateEnvVarKey = (oldKey: string, event: Event) => {
  const newKey = (event.target as HTMLInputElement).value;
  if (oldKey === newKey || !newKey) return;
  const value = config.value.environmentVariables![oldKey];
  delete config.value.environmentVariables![oldKey];
  config.value.environmentVariables![newKey] = value;
};

const addAccessUser = () => {
  if (!config.value.accessibleUsers) config.value.accessibleUsers = [];
  config.value.accessibleUsers.push({ id: '', name: '', ip: '' });
};

const removeAccessUser = (index: number) => {
  config.value.accessibleUsers.splice(index, 1);
};

const importCsv = () => {
  if (!config.value.accessibleUsers) config.value.accessibleUsers = [];
  const lines = csvText.value.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length >= 2) {
      config.value.accessibleUsers.push({
        id: parts[0].trim(),
        name: parts[1].trim(),
        ip: parts[2] ? parts[2].trim() : ''
      });
    }
  }
  showCsvDialog.value = false;
  csvText.value = '';
};

const checkMemoryLimit = (val: any) => {
  const num = Number(val);
  if (!isNaN(num) && num > 1024) {
    alert("提醒：記憶體限制超過 1GB (1024MB)！請確認您輸入的單位為 MB 而非 Bytes。");
  }
};
</script>

<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h3 class="text-h6 mb-2">Basic Info</h3>
        <v-text-field v-model="config.testTitle" label="Test Title" outlined></v-text-field>
        <v-textarea v-model="config.description" label="Description" outlined rows="3"></v-textarea>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <h3 class="text-h6 mb-2">Judger Settings</h3>
        <v-row v-if="config.judgerSettings">
          <v-col cols="4">
            <v-text-field v-model.number="config.judgerSettings.timeLimit" label="Time Limit (ms)" type="number" outlined></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field v-model.number="config.judgerSettings.memoryLimit" @update:model-value="checkMemoryLimit" label="Memory Limit (MB)" type="number" outlined></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-select v-model="config.judgerSettings.compareMode" :items="[{title: 'Strict Match (嚴格比對)', value: 'strict'}, {title: 'Whitespace-insensitive (標記忽略比對)', value: 'loose'}]" label="Compare Mode" outlined></v-select>
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="4">
        <v-text-field
          v-model.number="config.submitGraceSeconds"
          label="收卷緩衝 (秒)"
          type="number"
          outlined
          data-test="submit-grace-seconds"
          hint="宣布結束後仍接受提交的秒數，讓正在上傳的作答完成。留空為預設 60 秒。"
          persistent-hint
        ></v-text-field>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <h3 class="text-h6 mb-2 d-flex align-center">
          Environment Variables
          <v-btn v-if="!props.disabled" icon="mdi-plus" size="small" color="primary" class="ml-2" @click="addEnvVar"></v-btn>
        </h3>
        <v-card variant="outlined" class="pa-2" v-if="config.environmentVariables">
          <v-alert
            type="warning"
            variant="tonal"
            density="comfortable"
            class="mb-3"
            data-test="start-password-notice"
          >
            <div class="font-weight-bold mb-1">開考口令現在是考卷的解密金鑰</div>
            <div class="text-body-2">
              考卷會在考試開始前就送到每台機器，但以此口令保護、無法閱讀。監考現場宣讀口令後才解得開 ——
              因此<strong>開考前考卷的保護強度等同於這組口令</strong>。它不會下發到學生機器，請以紙本或口頭保管，勿寫在交給學生的任何檔案裡。
            </div>
          </v-alert>
          <v-row class="align-center mt-2">
            <v-col cols="5">
              <v-text-field model-value="startPassword" label="Key" density="compact" hide-details readonly disabled></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="config.environmentVariables.startPassword"
                label="開考口令（考卷解密金鑰）"
                density="compact"
                hide-details
                :readonly="props.disabled"
                data-test="start-password"
              ></v-text-field>
            </v-col>
            <v-col cols="1">
              <v-btn icon="mdi-key" size="small" color="grey" variant="text" disabled></v-btn>
            </v-col>
          </v-row>
          <template v-for="(_, key) in config.environmentVariables" :key="key">
            <v-row v-if="key !== 'startPassword'" class="align-center mt-2">
              <v-col cols="5">
                <v-text-field :model-value="key" @change="updateEnvVarKey(key as string, $event)" label="Key" density="compact" hide-details :readonly="props.disabled"></v-text-field>
              </v-col>
              <v-col cols="6">
                <v-text-field v-model="config.environmentVariables[key]" label="Value" density="compact" hide-details :readonly="props.disabled"></v-text-field>
              </v-col>
              <v-col cols="1">
                <v-btn v-if="!props.disabled" icon="mdi-delete" size="small" color="error" variant="text" @click="removeEnvVar(key as string)"></v-btn>
              </v-col>
            </v-row>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <h3 class="text-h6 mb-2 d-flex align-center">
          Accessible Users
          <v-btn v-if="!props.disabled" icon="mdi-plus" size="small" color="primary" class="ml-2" @click="addAccessUser"></v-btn>
          <v-btn v-if="!props.disabled" size="small" color="secondary" variant="tonal" class="ml-2" @click="showCsvDialog = true">Import CSV</v-btn>
        </h3>
        <v-card variant="outlined" class="pa-2" v-if="config.accessibleUsers && config.accessibleUsers.length">
          <v-row v-for="(user, index) in config.accessibleUsers" :key="index" class="align-center mt-2">
            <v-col cols="3">
              <v-text-field v-model="user.id" label="User ID" density="compact" hide-details :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model="user.name" label="Name" density="compact" hide-details :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-text-field v-model="user.ip" label="IP (Optional)" density="compact" hide-details :readonly="props.disabled"></v-text-field>
            </v-col>
            <v-col cols="1">
              <v-btn v-if="!props.disabled" icon="mdi-delete" size="small" color="error" variant="text" @click="removeAccessUser(index)"></v-btn>
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <h3 class="text-h6 mb-2">Global Special Rules</h3>
        <SpecialRuleEditor v-model="config.globalSpecialRules" :disabled="props.disabled" />
      </v-col>
    </v-row>

    <!-- CSV Import Dialog -->
    <v-dialog v-model="showCsvDialog" max-width="500px">
      <v-card>
        <v-card-title>Import Users via CSV</v-card-title>
        <v-card-text>
          <p class="text-caption mb-2">Format each line as: <code>id, name, ip</code> (ip is optional). Paste your data below.</p>
          <v-textarea v-model="csvText" label="CSV Data" outlined rows="10" hide-details></v-textarea>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer></v-spacer>
          <v-btn color="error" variant="text" @click="showCsvDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="elevated" @click="importCsv">Import</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>
