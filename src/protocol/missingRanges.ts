export function getMissingIndexes(receivedIndexes: Set<number>, totalChunks: number): number[] {
  const missing: number[] = [];
  for (let index = 0; index < totalChunks; index += 1) {
    if (!receivedIndexes.has(index)) {
      missing.push(index);
    }
  }
  return missing;
}

export function encodeMissingRanges(indexes: number[]): string {
  if (indexes.length === 0) {
    return '';
  }
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid missing index: ${index}`);
    }
  }
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const current of sorted.slice(1)) {
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(',');
}

export function expandMissingRanges(value: string, maxExclusive?: number): number[] {
  if (value === '') {
    return [];
  }
  if (maxExclusive !== undefined && (!Number.isInteger(maxExclusive) || maxExclusive < 0)) {
    throw new Error(`Invalid missing range: ${value}`);
  }
  return value.split(',').flatMap((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (match === null) {
      throw new Error(`Invalid missing range: ${part}`);
    }
    const [, startText, endText] = match;
    const start = Number(startText);
    const end = endText === undefined ? start : Number(endText);
    if (end < start || (maxExclusive !== undefined && end >= maxExclusive)) {
      throw new Error(`Invalid missing range: ${part}`);
    }
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  });
}
