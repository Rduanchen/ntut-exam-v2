<script setup lang="ts">
import { computed } from 'vue';
import type { SettingOrigin } from '../../../types/judge-settings';

const props = defineProps<{ origin: SettingOrigin | string }>();

/**
 * Where a value came from.
 *
 * `clamped` is deliberately distinct in KIND from the other three, not merely
 * a different colour on the same scale. The others say where a working value
 * came from; `clamped` says the operator's own value was refused, and it is
 * the only one that requires action.
 *
 * The whole reason this exists: the incident was caused by a limit nobody knew
 * about, silently defaulting inside a dependency. A number shown without its
 * origin recreates that condition on screen.
 */
const presentation = computed(() => {
  switch (props.origin) {
    case 'config':
      return { color: 'primary', icon: 'mdi-check-decagram', label: '設定檔指定', hint: '由 config.json 明確指定。' };
    case 'env':
      return { color: 'info', icon: 'mdi-sprout', label: '環境變數', hint: '首次啟動時從環境變數帶入。' };
    case 'default':
      return { color: 'grey', icon: 'mdi-circle-outline', label: '預設值', hint: '未手動指定，使用內建預設值。' };
    case 'clamped':
      return { color: 'warning', icon: 'mdi-alert', label: '設定值遭拒絕（未採用）', hint: '原設定值超出允許範圍，因此未採用。' };
    default:
      // Unknown origins must not break the page.
      return { color: 'grey', icon: 'mdi-help-circle-outline', label: `未識別來源（${props.origin}）`, hint: '無法辨識設定來源，請檢查原始值。' };
  }
});
</script>

<template>
  <v-tooltip :text="presentation.hint" location="top">
    <template #activator="{ props: tip }">
      <v-chip
        v-bind="tip"
        :color="presentation.color"
        :variant="origin === 'clamped' ? 'flat' : 'tonal'"
        size="small"
        :prepend-icon="presentation.icon"
        class="ml-2"
        data-test="origin-chip"
        :data-origin="origin"
      >
        {{ presentation.label }}
      </v-chip>
    </template>
  </v-tooltip>
</template>
