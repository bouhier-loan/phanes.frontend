import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('renpy-formats', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@phanes/renpy-formats');
  });
});
