import * as THREE from 'three/webgpu';

/** Original analytic HDR panorama: broad overhead softbox, warm key and cool strip.
 * Linear radiance above 1 survives PMREM; no network asset or third-party license.
 */
export function studioHDR(): THREE.DataTexture {
  const w = 512, h = 256;
  const data = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const panel = (cx: number, cy: number, sx: number, sy: number) => {
      const dx = Math.min(Math.abs(u-cx), 1-Math.abs(u-cx)) / sx;
      const dy = Math.abs(v-cy) / sy;
      return Math.exp(-Math.pow(dx, 12)-Math.pow(dy, 12));
    };
    const key = panel(.22,.3,.13,.08) * 5;
    const rim = panel(.72,.4,.025,.17) * 3;
    const ceiling = panel(.5,.12,.4,.04) * 2;
    const base = .12 + .3 * (1-v);
    const i = (y*w+x)*4;
    data[i] = THREE.DataUtils.toHalfFloat(base + key + rim*.82 + ceiling);
    data[i+1] = THREE.DataUtils.toHalfFloat(base + key*.94 + rim*.92 + ceiling);
    data[i+2] = THREE.DataUtils.toHalfFloat(base + key*.84 + rim + ceiling);
    data[i+3] = THREE.DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}
