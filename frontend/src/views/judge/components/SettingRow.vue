<script setup lang="ts">
import { computed } from 'vue';
import OriginChip from './OriginChip.vue';
import { useJudgeSettingsStore } from '../../../stores/judge-settings.store';
import type { EffectiveSetting } from '../../../types/judge-settings';

const props = defineProps<{
  settingKey: string;
  setting: EffectiveSetting;
  label: string;
  hint?: string;
}>();

const store = useJudgeSettingsStore();

/** The draft if one exists, otherwise the value in force. */
const shown = computed(() =>
  props.settingKey in store.drafts ? store.drafts[props.settingKey] : props.setting.value,
);

const dirty = computed(() => store.draftDiffers(props.settingKey));

const onInput = (value: string) => {
  const asNumber = Number(value);
  store.setDraft(props.settingKey, Number.isFinite(asNumber) && value !== '' ? asNumber : value);
};
</script>

<template>
  <div class="mb-4" :data-test="`setting-${settingKey}`">
    <div class="d-flex align-center mb-1">
      <span class="text-subtitle-2">{{ label }}</span>
      <OriginChip :origin="setting.origin" />
      <!-- Unsaved edits must be distinguishable from  -->
      <v-chip
        v-if="dirty"
        color="orange"
        size="small"
        variant="flat"
        class="ml-2"
        data-test="dirty-marker"
      >
        未儲存
      </v-chip>
    </div>

    <v-text-field
      :model-value="String(shown)"
      density="compact"
      hide-details
      variant="outlined"
      :data-test="`input-${settingKey}`"
      @update:model-value="onInput"
    />

    <div v-if="setting.origin === 'clamped'" class="text-caption text-warning mt-1" data-test="clamped-note">
      原設定值超出允許範圍，未被採用。目前實際生效值為 <strong>{{ setting.value }}</strong>。

    </div>
    <div v-if="hint" class="text-caption text-medium-emphasis mt-1">{{ hint }}</div>
  </div>
</template>
