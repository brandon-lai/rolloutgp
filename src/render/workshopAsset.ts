import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
export async function loadWorkshop() {
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/workshop.glb');
  gltf.scene.traverse(o=>{o.castShadow=true;o.receiveShadow=true;});
  return gltf.scene;
}
