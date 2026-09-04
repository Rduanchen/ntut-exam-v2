<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfigStore } from "../../../stores/config.store";

/** Below this, the operator is asked to confirm. Mirrors the backend's check. */
const WEAK_PASSWORD_LENGTH = 6;
import type { ExamConfig } from "../../../types/config";
import GeneralSettingsEditor from "./GeneralSettingsEditor.vue";
import SectionListEditor from "./SectionListEditor.vue";

const props = defineProps<{ initialData: ExamConfig; disabled?: boolean }>();
const configStore = useConfigStore();

const DRAFT_KEY = "draft_exam_config";

const patchConfig = (data: any) => {
  if (!data) data = {};
  if (!data.environmentVariables) {
    data.environmentVariables = { startPassword: "" };
  } else if (data.environmentVariables.startPassword === undefined) {
    data.environmentVariables.startPassword = "";
  }
  return data;
};

const loadInitialData = () => {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      return patchConfig(JSON.parse(draft));
    } catch (e) {
      console.error("Failed to parse draft config");
    }
  }
  return patchConfig(JSON.parse(JSON.stringify(props.initialData || {})));
};

const localForm = ref<ExamConfig>(loadInitialData());

// Save to localStorage whenever it changes
watch(
  () => localForm.value,
  (newVal) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(newVal));
  },
  { deep: true },
);

// Only update from backend if we don't have a draft, to prevent overwriting user input
watch(
  () => props.initialData,
  (newVal) => {
    if (newVal && !localStorage.getItem(DRAFT_KEY)) {
      localForm.value = patchConfig(JSON.parse(JSON.stringify(newVal)));
    }
  },
  { deep: true },
);

const tab = ref("general");
const fileInput = ref<HTMLInputElement | null>(null);

const submitForm = async (): Promise<boolean> => {
  const sectionIds = new Set<string>();
  const puzzleIds = new Set<string>();

  const startPassword = localForm.value.environmentVariables?.startPassword?.trim();
  if (!startPassword) {
    alert("開考口令是必填的，且不能為空。");
    return false;
  }

  /* The password stopped being a screen prompt and became the key that unwraps
   * the exam key. Before the exam starts, the paper's protection is exactly
   * this string's strength — and a short one can be guessed offline on the
   * machine that already holds the ciphertext.
   *
   * A short password is a decision the operator is allowed to make. Making it
   * without knowing what it now protects is not. */
  if (startPassword.length < WEAK_PASSWORD_LENGTH) {
    const proceed = confirm(
      `開考口令只有 ${startPassword.length} 個字元。\n\n` +
        "這組口令現在是考卷的解密金鑰：考卷會在開考前就送到每台學生機器上（以密文保存），" +
        "口令太短的話，學生有可能在開考前就把它試出來並讀到題目與測資。\n\n" +
        "確定要用這組口令嗎？"
    );
    if (!proceed) return false;
  }

  // Validate uniqueness and scores
  for (const section of localForm.value.sections || []) {
    if (!section.id?.trim()) {
      alert(`Section "${section.title}" has an empty ID.`);
      return false;
    }
    if (sectionIds.has(section.id)) {
      alert(`Duplicate Section ID found: ${section.id}`);
      return false;
    }
    sectionIds.add(section.id);

    let sumPuzzles = 0;
    for (const puzzle of section.puzzles || []) {
      if (!puzzle.id?.trim()) {
        alert(`Puzzle "${puzzle.title}" has an empty ID.`);
        return false;
      }
      if (puzzleIds.has(puzzle.id)) {
        alert(`Duplicate Puzzle ID found: ${puzzle.id}`);
        return false;
      }
      puzzleIds.add(puzzle.id);

      let sumSubtasks = 0;
      for (const subtask of puzzle.subtasks || []) {
        sumSubtasks += subtask.score;
      }

      sumPuzzles += puzzle.score;
    }
  }

  try {
    await configStore.saveConfig(localForm.value);
    localStorage.removeItem(DRAFT_KEY); // Clear draft after successful save
    alert("Configuration saved successfully!");
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

const exportJson = () => {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(localForm.value, null, 2));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "exam-config.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

const importJson = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      localForm.value = patchConfig(parsed);
    } catch (err) {
      alert("Invalid JSON file format");
    }
  };
  reader.readAsText(file);
};

const triggerFileInput = () => {
  if (fileInput.value) fileInput.value.click();
};

defineExpose({ submitForm });
</script>

<template>
  <v-form @submit.prevent="submitForm">
    <v-toolbar color="primary" class="text-white">
      <v-toolbar-title>Edit Configuration</v-toolbar-title>
      <v-spacer></v-spacer>
      <div v-if="!props.disabled">
        <input
          type="file"
          ref="fileInput"
          accept=".json"
          style="display: none"
          @change="importJson"
        />
        <v-btn prepend-icon="mdi-upload" @click="triggerFileInput"
          >Import JSON</v-btn
        >
        <v-btn prepend-icon="mdi-download" @click="exportJson"
          >Export JSON</v-btn
        >
      </div>
      <div v-else class="text-caption px-4">
        Some settings locked (Students, Passwords, IDs, Counts, Languages).
      </div>
    </v-toolbar>

    <v-tabs v-model="tab" color="primary">
      <v-tab value="general">General Settings</v-tab>
      <v-tab value="sections">Sections & Puzzles</v-tab>
    </v-tabs>

    <v-window v-model="tab" class="pa-4">
      <v-window-item value="general">
        <GeneralSettingsEditor v-model="localForm" :disabled="props.disabled" />
      </v-window-item>

      <v-window-item value="sections">
        <SectionListEditor
          v-model="localForm.sections"
          :disabled="props.disabled"
        />
      </v-window-item>
    </v-window>

    <v-divider></v-divider>
    <v-card-actions class="pa-4">
      <v-spacer></v-spacer>
      <v-btn
        type="submit"
        color="success"
        size="large"
        variant="elevated"
        :loading="configStore.loading"
      >
        {{
          props.disabled
            ? "Update Test Cases Only"
            : "Save Configuration to Backend"
        }}
      </v-btn>
    </v-card-actions>
  </v-form>
</template>
