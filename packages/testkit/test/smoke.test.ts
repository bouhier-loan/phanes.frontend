import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('testkit', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@phanes/testkit');
  });
});
