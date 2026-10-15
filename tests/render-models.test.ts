import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three/webgpu';
import { ROLLERS, TIRES } from '../src/sim/parts.ts';
import { DEFAULT_BODY } from '../src/sim/bodies.ts';
import { MM } from '../src/sim/units.ts';
import { partModel, disposeObject } from '../src/render/models/parts.ts';
import { shellGeometry } from '../src/render/body.ts';
import { QUALITY } from '../src/render/quality.ts';

it('keeps every roller and tire within its catalog dimensions at every quality', () => {
  for (const quality of Object.keys(QUALITY) as (keyof typeof QUALITY)[]) {
    for (const p of [...ROLLERS, ...TIRES]) {
      const model = partModel(p, quality);
      const size = new Box3().setFromObject(model).getSize(new Vector3()).divideScalar(MM);
      expect(size.x, `${quality}/${p.id} diameter`).toBeCloseTo(p.diameter, 3);
      if (p.slot === 'tires') {
        expect(size.y).toBeCloseTo(p.diameter, 3);
        expect(size.z).toBeCloseTo(p.width, 3);
      } else {
        expect(size.z).toBeCloseTo(p.diameter, 3);
        expect(size.y).toBeLessThanOrEqual(6.001);
      }
      disposeObject(model);
    }
  }
});

it('cuts actual shell openings and retains finite recipe-sized geometry', () => {
  const solid = shellGeometry({ ...DEFAULT_BODY, holes: 0 });
  const cut = shellGeometry({ ...DEFAULT_BODY, holes: 6 });
  expect(cut.getAttribute('position').count).not.toBe(solid.getAttribute('position').count);
  for (const g of [solid, cut]) {
    expect([...g.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x / MM).toBeCloseTo(Math.max(...DEFAULT_BODY.sections.map(s=>s.x)), 4);
    expect(g.boundingBox!.max.z / MM).toBeLessThanOrEqual(Math.max(...DEFAULT_BODY.sections.map(s=>s.w)) + .001);
    g.dispose();
  }
});
