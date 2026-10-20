<script setup lang="ts">
import { useJudgeSettingsStore } from '../../../stores/judge-settings.store';
import HealthPanel from './HealthPanel.vue';
import SettingRow from './SettingRow.vue';
import ContainerPanel from './ContainerPanel.vue';

const store = useJudgeSettingsStore();
const labels: Record<string, { label: string; hint?: string }> = {
  timeLimit: { label: '執行時間限制（ms）' }, memoryLimit: { label: '執行記憶體限制（MB）' },
  compareMode: { label: '輸出比對模式' }, compileMemoryLimit: { label: '編譯記憶體限制（位元組，-1 為無限制）' },
  compileTimeout: { label: '編譯時間限制（ms）', hint: '編譯逾時屬於系統錯誤。' },
  maxSystemRetries: { label: '系統錯誤重試次數', hint: '學生作答錯誤不會重試。' },
  maxConcurrentJobs: { label: '同時執行數', hint: '考試前請測量這台機器的容量。' },
};
const describe = (key: string) => labels[key] ?? { label: key };
</script>

<template>
  <div data-test="judge-settings-panel">
    <HealthPanel />
    <v-alert v-if="store.settingsError" type="error" variant="tonal" class="mb-6" data-test="settings-error">
      無法載入評測設定： {{ store.settingsError }}
      <div class="text-caption mt-1">無法確認設定值，因此暫不顯示可能已過期的數值。</div>
    </v-alert>
    <template v-if="store.settings">
      <v-card class="mb-6" data-test="exam-panel"><v-card-title>評測規則</v-card-title>
        <v-card-subtitle>這些設定隨考卷移動。</v-card-subtitle><v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-exam">
            上傳 <code>config.json</code> 會<strong>取代</strong>這些設定；未提供的欄位會恢復預設值。
          </v-alert>
          <SettingRow v-for="[key, setting] in store.group('exam')" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
        </v-card-text></v-card>
      <v-card class="mb-6" data-test="machine-panel"><v-card-title>機器容量</v-card-title>
        <v-card-subtitle>這些數值描述目前機器的容量。</v-card-subtitle><v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4" data-test="replacement-warning-machine">
            上傳 <code>config.json</code> 也會<strong>取代</strong>這些設定。請測量本機容量；<strong>考卷移到其他機器時須重新測量。</strong>
          </v-alert>
          <SettingRow v-for="[key, setting] in store.group('machine')" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
          <div v-if="store.activeCeiling !== null" class="text-caption">目前同時執行上限為 {{ store.activeCeiling }} 個工作。</div>
        </v-card-text></v-card>
      <v-card v-if="store.unknownSettings.length" class="mb-6" data-test="unknown-panel"><v-card-title>其他設定</v-card-title><v-card-text>
        <SettingRow v-for="[key, setting] in store.unknownSettings" :key="key" :setting-key="key" :setting="setting" v-bind="describe(key)" />
      </v-card-text></v-card>
      <v-alert v-if="store.saveError" type="error" variant="tonal" class="mb-4" data-test="save-error">無法儲存： {{ store.saveError }}</v-alert>
      <div class="d-flex align-center mb-8">
        <v-btn color="primary" :disabled="!store.isDirty" :loading="store.saving" data-test="save" @click="store.save()">儲存變更</v-btn>
        <v-btn variant="text" class="ml-2" :disabled="!store.isDirty" data-test="discard" @click="store.discardDrafts()">捨棄變更</v-btn>
        <span v-if="store.isDirty" class="ml-4 text-caption text-warning" data-test="dirty-hint">未儲存的變更尚未生效。</span>
      </div>
    </template>
    <ContainerPanel />
  </div>
</template>
