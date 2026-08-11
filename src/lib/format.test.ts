import { describe, expect, it } from 'vitest';
import { formatGreeting, pluralize } from './format';

// Pattern: pure-function unit tests. Table-driven where the cases are uniform,
// named `it` blocks where a case needs explaining.
describe('formatGreeting', () => {
  it('greets a named user', () => {
    expect(formatGreeting('Katsu')).toBe('Hello, Katsu!');
  });

  it('trims surrounding whitespace', () => {
    expect(formatGreeting('  Katsu  ')).toBe('Hello, Katsu!');
  });

  it.each([
    { input: '', label: 'empty string' },
    { input: '   ', label: 'whitespace only' },
  ])('falls back to a generic greeting for $label', ({ input }) => {
    expect(formatGreeting(input)).toBe('Hello there!');
  });
});

describe('pluralize', () => {
  it.each([
    { count: 0, expected: '0 clicks' },
    { count: 1, expected: '1 click' },
    { count: 2, expected: '2 clicks' },
    { count: -1, expected: '-1 click' },
  ])('renders $count as "$expected"', ({ count, expected }) => {
    expect(pluralize(count, 'click')).toBe(expected);
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(3, 'person', 'people')).toBe('3 people');
  });
});
