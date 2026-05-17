import { describe, it, expect } from 'vitest';
import { buildTree } from '../../lib/tree-builder.js';

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('returns empty array for non-array input', () => {
    expect(buildTree(null)).toEqual([]);
  });

  it('returns single root frame with no children', () => {
    const input = [{ id: 'main', src: '/page', parentId: null, tagName: 'turbo-frame' }];
    const result = buildTree(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('main');
    expect(result[0].children).toEqual([]);
  });

  it('creates nested structure from parent-child relationship', () => {
    const input = [
      { id: 'parent', src: null, parentId: null, tagName: 'turbo-frame' },
      { id: 'child', src: '/sub', parentId: 'parent', tagName: 'turbo-frame' },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].id).toBe('child');
  });

  it('handles controller elements', () => {
    const input = [
      { id: 'el-1', controllers: ['modal', 'dropdown'], parentId: null, tagName: 'div' },
    ];
    const result = buildTree(input);
    expect(result[0].tagName).toBe('div');
    expect(result[0].controllers).toEqual(['modal', 'dropdown']);
  });

  it('handles mixed frames and controllers', () => {
    const input = [
      { id: 'frame-1', src: null, parentId: null, tagName: 'turbo-frame' },
      { id: 'ctrl-1', controllers: ['tabs'], parentId: 'frame-1', tagName: 'div' },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].tagName).toBe('div');
  });

  it('promotes items with missing parents to roots', () => {
    const input = [
      { id: 'orphan', src: null, parentId: 'missing-parent', tagName: 'turbo-frame' },
    ];
    const result = buildTree(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('orphan');
  });

  it('handles frame with attached controllers', () => {
    const input = [
      { id: 'frame-1', src: '/page', parentId: null, tagName: 'turbo-frame', controllers: ['lazy'] },
    ];
    const result = buildTree(input);
    expect(result[0].tagName).toBe('turbo-frame');
    expect(result[0].controllers).toEqual(['lazy']);
  });
});
