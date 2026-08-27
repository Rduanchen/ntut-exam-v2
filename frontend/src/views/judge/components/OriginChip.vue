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
      return { color: 'primary', icon: 'mdi-check-decagram', label: 'Set in config', hint: 'Chosen deliberately in config.json.' };
    case 'env':
      return { color: 'info', icon: 'mdi-sprout', label: 'From environment', hint: 'Seeded from the environment on first run.' };
    case 'default':
      return { color: 'grey', icon: 'mdi-circle-outline', label: 'Default', hint: 'Nobody chose this. It is the built-in default.' };
    case 'clamped':
      return { color: 'warning', icon: 'mdi-alert', label: 'Rejected — clamped', hint: 'The configured value was outside the permitted range and was NOT applied.' };
    default:
      // Unknown origins must not break the page.
      return { color: 'grey', icon: 'mdi-help-circle-outline', label: String(props.origin), hint: 'Unrecognised origin.' };
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
