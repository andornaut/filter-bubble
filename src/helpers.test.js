import { humanDate, sortByModifiedDateDesc, toCanonicalArray, unsplit } from './helpers';

describe('helpers', () => {
  describe('humanDate', () => {
    it('should return time format for today', () => {
      const today = new Date().toISOString();
      const result = humanDate(today);
      expect(result).toMatch(/^\d{1,2}:\d{2}[ap]m$/);
    });

    it('should return date string for non-today dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = humanDate(yesterday.toISOString());
      expect(result).toMatch(/^\w{3} \w{3} \d{2} \d{4}$/);
    });
  });

  describe('sortByModifiedDateDesc', () => {
    it('should sort items by modified date in descending order', () => {
      const items = [
        { modifiedDate: '2023-01-01T00:00:00Z' },
        { modifiedDate: '2023-01-03T00:00:00Z' },
        { modifiedDate: '2023-01-02T00:00:00Z' },
      ];
      const result = sortByModifiedDateDesc(items);
      expect(result[0].modifiedDate).toBe('2023-01-03T00:00:00Z');
      expect(result[1].modifiedDate).toBe('2023-01-02T00:00:00Z');
      expect(result[2].modifiedDate).toBe('2023-01-01T00:00:00Z');
    });
  });

  describe('toCanonicalArray', () => {
    it('should split by commas and newlines, trim and remove duplicates', () => {
      const input = 'apple, banana\norange,apple, cherry';
      const result = toCanonicalArray(input);
      expect(result).toEqual(['apple', 'banana', 'cherry', 'orange']);
    });

    it('should handle empty string', () => {
      const result = toCanonicalArray('');
      expect(result).toEqual([]);
    });

    it('should handle null/undefined', () => {
      expect(toCanonicalArray(null)).toEqual([]);
      expect(toCanonicalArray(undefined)).toEqual([]);
    });
  });

  describe('unsplit', () => {
    it('should join array with comma and space', () => {
      const input = ['apple', 'banana', 'cherry'];
      const result = unsplit(input);
      expect(result).toBe('apple, banana, cherry');
    });

    it('should handle empty array', () => {
      const result = unsplit([]);
      expect(result).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(unsplit(null)).toBe('');
      expect(unsplit(undefined)).toBe('');
    });
  });
});
