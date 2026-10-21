import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { VTextField, VTextarea } from 'vuetify/components';
import type { ExamConfig } from '../src/types/config';
import GeneralSettingsEditor from '../src/views/config/components/GeneralSettingsEditor.vue';
import SectionListEditor from '../src/views/config/components/SectionListEditor.vue';
import PuzzleListEditor from '../src/views/config/components/PuzzleListEditor.vue';
import ConfigForm from '../src/views/config/components/ConfigForm.vue';

const vuetify = createVuetify({ components, directives });

const config: ExamConfig = {
  testTitle: 'Exam',
  description: '',
  judgerSettings: { timeLimit: 1000, memoryLimit: 256 },
  environmentVariables: { startPassword: 'secret', EXTRA_FLAG: 'old' },
  accessibleUsers: [{ id: 'student', name: 'Student' }],
  sections: [{
    id: 'S1', title: 'Section', description: 'Fixed', maxScore: 100,
    puzzles: [{
      id: 'Q1', title: 'Puzzle', language: 'Python', score: 100, multiplier: 0.5,
      subtasks: [{ title: 'Subtask', score: 100, visible: [{ input: '1', output: '2' }], hidden: [] }],
    }],
  }],
};

const field = (wrapper: ReturnType<typeof mount>, label: string) => {
  const result = wrapper.findAllComponents(VTextField).find((item) => item.props('label') === label);
  expect(result, `Missing field: ${label}`).toBeDefined();
  return result!;
};

describe('initialized config editor', () => {
  it('locks section metadata while keeping question settings editable', async () => {
    const section = mount(SectionListEditor, {
      props: { modelValue: structuredClone(config.sections), disabled: true },
      global: { plugins: [vuetify] },
    });
    await section.find('.v-expansion-panel-title').trigger('click');
    expect(field(section, '區段 ID').props('readonly')).toBe(true);
    expect(field(section, '標題').props('readonly')).toBe(true);
    expect(field(section, '最高分').props('readonly')).toBe(true);
    expect(section.findComponent(VTextarea).props('readonly')).toBe(true);

    const puzzle = mount(PuzzleListEditor, {
      props: { modelValue: structuredClone(config.sections[0].puzzles), disabled: true },
      global: { plugins: [vuetify] },
    });
    await puzzle.find('.v-expansion-panel-title').trigger('click');
    expect(field(puzzle, '題目 ID').props('readonly')).toBe(true);
    expect(field(puzzle, '程式語言').props('readonly')).toBe(true);
    expect(field(puzzle, '規則扣分倍率').props('readonly')).not.toBe(true);
    expect(puzzle.text()).toContain('新增規則');
  });

  it('locks the password and roster but permits other environment variables and rules', () => {
    const wrapper = mount(GeneralSettingsEditor, {
      props: { modelValue: structuredClone(config), disabled: true },
      global: { plugins: [vuetify] },
    });
    expect(field(wrapper, '開考口令（考卷解密金鑰）').props('readonly')).toBe(true);
    expect(field(wrapper, '學號').props('readonly')).toBe(true);
    expect(field(wrapper, '數值').props('readonly')).not.toBe(true);
    expect(wrapper.text()).toContain('新增規則');
  });

  it('loads the saved paper when an older draft changes locked fields', () => {
    const stale = structuredClone(config);
    stale.accessibleUsers[0].name = 'Stale name';
    localStorage.setItem('draft_exam_config', JSON.stringify(stale));
    const wrapper = mount(ConfigForm, {
      props: { initialData: structuredClone(config), disabled: true },
      global: { plugins: [vuetify, createPinia()] },
    });
    expect(field(wrapper, '姓名').props('modelValue')).toBe('Student');
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('儲存考試設定變更');
    localStorage.removeItem('draft_exam_config');
  });
});
