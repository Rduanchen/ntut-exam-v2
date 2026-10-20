<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  students: any[];
  selectedStudent: any | null;
}>();

const emit = defineEmits<{
  (e: 'select', student: any): void;
}>();

const search = ref('');

const filteredStudents = computed(() => {
  if (!search.value) return props.students;
  const q = search.value.toLowerCase();
  return props.students.filter(s => {
    const name = (s.name || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    return name.includes(q) || id.includes(q);
  });
});
</script>

<template>
  <v-card class="h-100 d-flex flex-column" border elevation="1">
    <v-card-title class="pa-4 bg-grey-lighten-4 border-b">
      <v-text-field
        v-model="search"
        prepend-inner-icon="mdi-magnify"
        label="搜尋學生（學號／姓名）"
        variant="outlined"
        density="compact"
        hide-details
        clearable
      ></v-text-field>
    </v-card-title>
    
    <v-divider></v-divider>

    <v-list class="flex-grow-1 overflow-y-auto" style="max-height: calc(100vh - 250px);">
      <v-list-item
        v-for="student in filteredStudents"
        :key="student.id"
        :active="props.selectedStudent?.id === student.id"
        @click="emit('select', student)"
        color="primary"
        class="border-b"
      >
        <template v-slot:prepend>
          <v-badge
            dot
            :color="student.isOnline ? 'success' : 'grey'"
            offset-x="6"
            offset-y="6"
          >
            <v-avatar color="primary" variant="tonal" size="40">
              <span class="text-subtitle-2 font-weight-bold">{{ (student.name || '?').charAt(0).toUpperCase() }}</span>
            </v-avatar>
          </v-badge>
        </template>
        
        <v-list-item-title class="font-weight-medium">
          {{ student.name || '未知學生' }}
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption mt-1">
          <v-icon size="small" class="mr-1">mdi-card-account-details</v-icon>
          {{ student.id }}
        </v-list-item-subtitle>
      </v-list-item>

      <v-list-item v-if="filteredStudents.length === 0">
        <v-list-item-title class="text-center text-medium-emphasis py-4">
          找不到符合條件的學生
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<style scoped>
.v-list-item--active {
  background-color: rgba(var(--v-theme-primary), 0.08);
}
</style>
