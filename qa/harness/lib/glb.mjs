/** A tiny valid binary glTF (a 0.3 m box) served in place of the store's real 3D models (CDN is blocked). */
export function boxGlb(size = 0.3) {
  const h = size / 2;
  const p = [[-h, 0, -h], [h, 0, -h], [h, size, -h], [-h, size, -h], [-h, 0, h], [h, 0, h], [h, size, h], [-h, size, h]];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3];
  const pos = Buffer.alloc(p.length * 12);
  p.forEach((v, i) => v.forEach((c, j) => pos.writeFloatLE(c, i * 12 + j * 4)));
  const ind = Buffer.alloc(idx.length * 2);
  idx.forEach((v, i) => ind.writeUInt16LE(v, i * 2));
  const bin = Buffer.concat([pos, ind, Buffer.alloc((4 - ((pos.length + ind.length) % 4)) % 4)]);
  const gltf = {
    asset: { version: '2.0', generator: 'oka-qa-harness' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'QA placeholder model' }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.85, 0.85, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 }, { buffer: 0, byteOffset: pos.length, byteLength: ind.length, target: 34963 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: p.length, type: 'VEC3', min: [-h, 0, -h], max: [h, size, h] },
      { bufferView: 1, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + json.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}
