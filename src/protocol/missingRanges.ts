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
  const sorted = [...indexes].sort((a, b) => a - b);
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

export function expandMissingRanges(value: string): number[] {
  if (value.trim() === '') {
    return [];
  }
  return value.split(',').flatMap((part) => {
    const [startText, endText] = part.split('-');
    const start = Number(startText);
    const end = endText === undefined ? start : Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error(`Invalid missing range: ${part}`);
    }
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  });
}
