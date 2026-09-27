/**
 * Picking tesztek: tartalmazás és koordináta-transzformáció.
 */

import { describe, expect, it } from 'vitest';
import { pointInTriangle, screenToWorld } from '../src/viz/picking';
import { buildCantilever } from '../src/models/cantilever';
import { findElementAt } from '../src/viz/picking';

describe('pointInTriangle', () => {
  it('a háromszög belsejében lévő pontot talál', () => {
    expect(pointInTriangle(0.2, 0.2, 0, 0, 1, 0, 0, 1)).toBe(true);
  });

  it('a háromszögön kívüli pontot elutasít', () => {
    expect(pointInTriangle(0.9, 0.9, 0, 0, 1, 0, 0, 1)).toBe(false);
    expect(pointInTriangle(-1, -1, 0, 0, 1, 0, 0, 1)).toBe(false);
  });

  it('csúcsponton és élen igaz (határeset)', () => {
    expect(pointInTriangle(0, 0, 0, 0, 1, 0, 0, 1)).toBe(true);
    expect(pointInTriangle(0.5, 0, 0, 0, 1, 0, 0, 1)).toBe(true);
  });
});

describe('screenToWorld', () => {
  it('a renderer transzformációjának inverze', () => {
    const t = { midX: 2, midY: 1, scale: 100, canvasWidth: 600, canvasHeight: 500 };
    // világból képernyőbe (renderer képlete), majd vissza
    const wx = 3.5;
    const wy = 2.25;
    const sx = 600 / 2 + (wx - 2) * 100;
    const sy = 500 / 2 - (wy - 1) * 100;
    const world = screenToWorld(sx, sy, t);
    expect(world.x).toBeCloseTo(wx, 10);
    expect(world.y).toBeCloseTo(wy, 10);
  });
});

describe('findElementAt', () => {
  it('rácsos modellben a megfelelő elemet adja vissza', () => {
    const mesh = buildCantilever({ L: 2, H: 0.4, density: 2 });
    // egy biztosan létező pont: a modell közepe
    const mid = findElementAt(mesh, 1.0, 0.2);
    expect(mid).not.toBeNull();
    // biztosan üres hely: a modell felett messze
    expect(findElementAt(mesh, 1.0, 50)).toBeNull();
  });
});
