import { describe, expect, it } from 'vitest';
import { encodeMissingRanges, expandMissingRanges, getMissingIndexes } from './missingRanges';

describe('missing ranges', () => {
  it('encodes missing indexes compactly', () => {
    expect(encodeMissingRanges([0, 1, 2, 5, 7, 8])).toBe('0-2,5,7-8');
  });

  it('deduplicates missing indexes when encoding ranges', () => {
    expect(encodeMissingRanges([1, 1, 2])).toBe('1-2');
  });

  it('rejects invalid indexes when encoding ranges', () => {
    for (const index of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => encodeMissingRanges([index])).toThrow('Invalid missing index');
    }
  });

  it('expands ranges back to indexes', () => {
    expect(expandMissingRanges('0-2,5,7-8')).toEqual([0, 1, 2, 5, 7, 8]);
  });

  it('rejects malformed ranges', () => {
    for (const value of ['-1', '0-', '1-2-3', 'a', '2-1']) {
      expect(() => expandMissingRanges(value)).toThrow('Invalid missing range');
    }
  });

  it('rejects whitespace-only ranges', () => {
    expect(() => expandMissingRanges('   ')).toThrow('Invalid missing range');
  });

  it('rejects ranges outside the max exclusive bound', () => {
    expect(() => expandMissingRanges('0-999999999', 10)).toThrow('Invalid missing range');
  });

  it('expands ranges within the max exclusive bound', () => {
    expect(expandMissingRanges('0-2', 3)).toEqual([0, 1, 2]);
  });

  it('finds missing indexes from received chunk indexes', () => {
    expect(getMissingIndexes(new Set([0, 2]), 4)).toEqual([1, 3]);
  });
});
