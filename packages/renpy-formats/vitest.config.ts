import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'renpy-formats',
    include: ['test/**/*.test.ts'],
  },
});
