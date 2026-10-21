import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('core', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@phanes/core');
  });
});
