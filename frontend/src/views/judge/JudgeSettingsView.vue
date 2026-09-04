<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useJudgeSettingsStore } from '../../stores/judge-settings.store';
import { useDeployTestStore } from '../../stores/deploy-test.store';
import JudgeSettingsPanel from './components/JudgeSettingsPanel.vue';
import DeployTestPanel from './components/DeployTestPanel.vue';

const settings = useJudgeSettingsStore();
const deploy = useDeployTestStore();
const tab = ref<'settings' | 'deploy-test'>('settings');
watch(() => deploy.active, (active) => { if (active) tab.value = 'deploy-test'; });
onMounted(async () => {
  await Promise.allSettled([settings.loadAll(), deploy.loadAll()]);
  if (deploy.active) tab.value = 'deploy-test';
});
onBeforeUnmount(() => deploy.teardown());
</script>

<template>
  <v-container fluid data-test="judge-settings-view">
    <h1 class="text-h5 mb-4">Judge</h1>
    <v-tabs v-model="tab" class="mb-5">
      <v-tab value="settings" data-test="judge-tab-settings">Settings</v-tab>
      <v-tab value="deploy-test" data-test="judge-tab-deploy-test">Deploy Test</v-tab>
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item value="settings"><JudgeSettingsPanel /></v-window-item>
      <v-window-item value="deploy-test"><DeployTestPanel /></v-window-item>
    </v-window>
  </v-container>
</template>
