import { describe, it, expect } from 'vitest';
import { buildTree } from '../../lib/tree-builder.js';

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('returns single root frame with no children', () => {
    const input = [{ id: 'main', src: '/page', parentId: null, type: 'frame' }];
    const result = buildTree(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('main');
    expect(result[0].children).toEqual([]);
  });

  it('creates nested structure from parent-child relationship', () => {
    const input = [
      { id: 'parent', src: null, parentId: null, type: 'frame' },
      { id: 'child', src: '/sub', parentId: 'parent', type: 'frame' },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].id).toBe('child');
  });

  it('handles controller elements', () => {
    const input = [
      { id: 'el-1', controllers: ['modal', 'dropdown'], parentId: null, type: 'controller' },
    ];
    const result = buildTree(input);
    expect(result[0].type).toBe('controller');
    expect(result[0].controllers).toEqual(['modal', 'dropdown']);
  });

  it('handles mixed frames and controllers', () => {
    const input = [
      { id: 'frame-1', src: null, parentId: null, type: 'frame' },
      { id: 'ctrl-1', controllers: ['tabs'], parentId: 'frame-1', type: 'controller' },
    ];
    const result = buildTree(input);
    expect(result[0].children[0].type).toBe('controller');
  });

  it('handles frame with attached controllers', () => {
    const input = [
      { id: 'frame-1', src: '/page', parentId: null, type: 'frame', controllers: ['lazy'] },
    ];
    const result = buildTree(input);
    expect(result[0].type).toBe('frame');
    expect(result[0].controllers).toEqual(['lazy']);
  });
});
