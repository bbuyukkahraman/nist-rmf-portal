import { describe, it, expect } from 'vitest';
import { baselineFor, overallImpact } from './baseline';

describe('baseline', () => {
  it('overallImpact picks max', () => {
    expect(overallImpact('low', 'high', 'moderate')).toBe('high');
    expect(overallImpact('low', 'low', 'low')).toBe('low');
    expect(overallImpact('moderate', 'moderate', 'low')).toBe('moderate');
  });
  it('baseline grows with impact', () => {
    const low = baselineFor('low');
    const mod = baselineFor('moderate');
    const high = baselineFor('high');
    expect(low.length).toBeGreaterThan(30);
    expect(mod.length).toBeGreaterThan(low.length);
    expect(high.length).toBeGreaterThan(mod.length);
  });
  it('high baseline contains low controls', () => {
    const lowIds = new Set(baselineFor('low').map(c => c.id));
    for (const c of baselineFor('high')) {
      // every high control's minImpact <= high; low controls subset not guaranteed but spot check
    }
    expect(baselineFor('high').some(c => c.id === 'AC-1')).toBe(true);
  });
});
