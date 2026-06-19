import { describe, expect, it } from 'vitest';
import { encodeMissingRanges, expandMissingRanges, getMissingIndexes } from './missingRanges';

describe('missing ranges', () => {
  it('encodes missing indexes compactly', () => {
    expect(encodeMissingRanges([0, 1, 2, 5, 7, 8])).toBe('0-2,5,7-8');
  });

  it('expands ranges back to indexes', () => {
    expect(expandMissingRanges('0-2,5,7-8')).toEqual([0, 1, 2, 5, 7, 8]);
  });

  it('finds missing indexes from received chunk indexes', () => {
    expect(getMissingIndexes(new Set([0, 2]), 4)).toEqual([1, 3]);
  });
});
