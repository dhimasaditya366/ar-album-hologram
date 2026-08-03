/**
 * character.js
 *
 * Setup bareng buat render karakter MetaHuman (lighting + material fixes +
 * loader) — dipakai bareng sama Preview3D.jsx (non-AR, full studio setup)
 * dan ARScene.jsx (AR, background/fog/ground-nya beda karena nimpa live
 * camera feed). Diekstrak dari Preview3D.jsx biar dua tempat itu gak perlu
 * duplikat & drift logic-nya — SEMUA fungsi di sini murni "bagaimana
 * karakter dirender", gak megang scene composition (background/fog/ground)
 * yg emang beda kebutuhan antara preview studio vs AR overlay.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export const MODEL_URL = import.meta.env.BASE_URL + 'assets/mh_dimas_optimized.glb';
export const DRACO_DECODER_PATH = import.meta.env.BASE_URL + 'assets/draco/gltf/';

/* ────────────────────────────────────────────────────────────────────── */
/* Lighting — three-point (key/fill/rim) + hemisphere fill                 */
/* ────────────────────────────────────────────────────────────────────── */
export function setupLighting(scene, { debug = false, castShadow = true } = {}) {
  const helpers = [];

  // Key — sumber cahaya utama, diagonal atas-depan, satu-satunya yg cast
  // shadow (fill/rim gak usah, biar shadow gak dobel/berantakan).
  // Sempat 1.2 → kebukti overexposed, diturunin ke 0.95. User minta naik
  // lagi tanpa angka pasti ("something in between") — 1.05 dipilih sbg
  // titik tengah antara 0.95 (udah kebukti aman) dan 1.2 (udah kebukti
  // ketinggian).
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(1.1, 1.7, 1.4);
  key.target.position.set(0, 0.1, 0);
  // castShadow bisa dimatiin (AR) — gak ada ground/floor buat nangkep
  // shadow di AR overlay, jadi shadow map cuma buang-buang biaya render di
  // device mobile yg udah sibuk ngolah camera feed + tracking.
  if (castShadow) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0001;
    key.shadow.normalBias = 0.02;
    // Shadow radius (PCF blur) — diminta biar transisi shadow di bawah
    // dagu/leher gak keras/tajam. Cuma ngefek kalau shadowMap.type PCFSoft
    // (radius diabaikan di PCFSoft yg udah otomatis lembut) — tapi tetep
    // diset eksplisit sesuai basic PCF radius biar konsisten kalau someday
    // shadowMap.type diganti ke THREE.PCFShadowMap biasa.
    key.shadow.radius = 4;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 6;
    key.shadow.camera.left = -1.3;
    key.shadow.camera.right = 1.3;
    key.shadow.camera.top = 1.3;
    key.shadow.camera.bottom = -1.3;
  }
  scene.add(key, key.target);

  // Fill — lawan arah key, redup, agak kebiruan biar shadow area gak item
  // mati. Posisi digeser ke depan (Z positif, deket sama key yg di Z=1.4)
  // dari sebelumnya agak di belakang (Z=-0.5) — biar bener2 "ngangkat"
  // rahang kiri yg jadi sisi berlawanan dari key light, bukan cuma ngisi
  // ambient belakang yg gak kena rahang.
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.33);
  fill.position.set(-1.3, 0.85, 0.9);
  fill.target.position.set(0, 0.1, 0);
  scene.add(fill, fill.target);

  // Rim/back — di belakang-atas karakter, buat highlight siluet rambut & bahu.
  // 0.8 awalnya ketinggian & nembus rambut — root cause-nya (depthWrite:false)
  // udah dibenerin di material hair (lihat setupHairMaterial), lalu sempat
  // naik ke 0.65 buat highlight glossy, tapi user bilang rambut jadi
  // kemengkilatan → diturunin ke 0.5. Sekarang minta naik lagi tanpa angka
  // pasti — 0.6 dipilih sbg titik tengah, dan karena rambut sekarang matte
  // (roughness tinggi, clearcoat/sheen 0 di setupHairMaterial) rim setinggi
  // ini gak bakal balik jadi "shiny", cuma nge-highlight siluet aja.
  const rim = new THREE.DirectionalLight(0xfff4e0, 0.6);
  rim.position.set(-0.3, 1.8, -1.9);
  rim.target.position.set(0, 0.2, 0);
  scene.add(rim, rim.target);

  // Hemisphere lembut — ambient yg lebih natural dari AmbientLight polos
  // (langit kebiruan dari atas, pantulan lantai kecoklatan dari bawah).
  // Diturunin dikit biar gak nambah overall brightness dobel sama PMREM env.
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a1410, 0.2);
  scene.add(hemi);

  if (debug) {
    const keyHelper = new THREE.DirectionalLightHelper(key, 0.3, 0xff5555);
    const fillHelper = new THREE.DirectionalLightHelper(fill, 0.3, 0x55aaff);
    const rimHelper = new THREE.DirectionalLightHelper(rim, 0.3, 0x55ff88);
    scene.add(keyHelper, fillHelper, rimHelper);
    helpers.push(keyHelper, fillHelper, rimHelper);
    if (castShadow) {
      const shadowHelper = new THREE.CameraHelper(key.shadow.camera);
      scene.add(shadowHelper);
      helpers.push(shadowHelper);
    }
  }

  return { key, fill, rim, hemi, helpers };
}

/* ────────────────────────────────────────────────────────────────────── */
/* Material shader helpers                                                 */
/* ────────────────────────────────────────────────────────────────────── */
// Value noise 2D murah (hash-based) — dipakai di setupMaterials (variasi
// roughness kulit) & setupHairMaterial (flyaway edge noise). Di-inject lewat
// onBeforeCompile, ditaruh tepat sebelum `void main() {` biar declare
// SETELAH semua uniform/varying bawaan three (butuh itu buat kompile) tapi
// SEBELUM dipanggil di body main().
export const NOISE_GLSL = `
float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float shNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = shHash(i);
  float b = shHash(i + vec2(1.0, 0.0));
  float c = shHash(i + vec2(0.0, 1.0));
  float d = shHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
`;

/* ────────────────────────────────────────────────────────────────────── */
/* Material — kulit & material umum non-rambut                             */
/* ────────────────────────────────────────────────────────────────────── */
export function setupMaterials(mesh) {
  const isArray = Array.isArray(mesh.material);
  const mats = isArray ? mesh.material : [mesh.material];

  mats.forEach((m, i) => {
    if (!m) return;

    // three@0.147 gak punya scene.environmentIntensity (baru ada di versi
    // jauh lebih baru), jadi kontribusi PMREM env (reflection dari
    // RoomEnvironment) cuma bisa diredam per-material lewat envMapIntensity.
    // Default-nya 1 — ditumpuk sama 3 directional light + hemisphere bikin
    // skin keliatan overexposed & "plastic-shiny" alih-alih real-life.
    // (Kalau scene gak punya environment sama sekali — kayak di AR — ini
    // gak ngefek apa2, aman dibiarin.)
    if ('envMapIntensity' in m) m.envMapIntensity = 0.55;

    const texName = m.map?.name ?? '';

    // Eyelash asli di-render lewat shader UE yg nge-tint root/tip color
    // terpisah dari texture shape-mask-nya; pas di-convert ke glTF standard
    // material, tint itu ilang & material.color jatuh ke putih polos →
    // lash keliatan pucat/gak berwarna. Kasih tint gelap manual. Alpha-nya
    // tetep blend biasa (lash tipis, blend natural gak masalah — beda sama
    // hair yg areanya luas jadi belang keliatan kalau depthWrite:false).
    const isEyelash = /eyelash/i.test(texName) || /eyelash/i.test(mesh.name);
    if (isEyelash) {
      if (m.transparent) {
        m.depthWrite = true;
        m.alphaTest = 0.1;
      }
      m.color.setHex(0x1a1310);
      return;
    }

    // Kulit — material aslinya MeshStandardMaterial polos, roughness FLAT
    // (gak ada roughnessMap) → itu penyebab kesan "plastic/waxy": T-zone
    // (dahi/hidung) & pipi kena treatment roughness yg sama persis, gak ada
    // variasi micro-detail sama sekali. Gak ada asset roughnessMap asli di
    // proyek ini, jadi variasinya di-generate procedural lewat noise —
    // bukan pemetaan T-zone yg presisi anatomis (butuh tau UV layout persis
    // buat itu, gak ada datanya), tapi minimal mecahin flat-uniform-nya jadi
    // ada micro-variation yg keliatan lebih kulit asli.
    //
    // Upgrade ke MeshPhysicalMaterial (bukan sekadar mutate yg lama) karena
    // sheen (buat aproksimasi subsurface-scattering ringan di tepi
    // hidung/telinga) cuma ada di Physical, gak ada efeknya kalau diset di
    // StandardMaterial biasa. transmission (refraksi kaca) SENGAJA gak
    // dipakai — butuh renderer nyampling background jadi render-target
    // (transmissionResolutionScale dkk), nambah cost render & gampang
    // keliatan aneh (skin bukan benda tembus cahaya beneran); sheen udah
    // cukup buat kesan "gak plastic" tanpa risiko itu.
    const isSkin = /skin/i.test(texName);
    if (isSkin && m.type === 'MeshStandardMaterial') {
      // PENTING: jangan `new MeshPhysicalMaterial().copy(m)` — Physical
      // .copy() nganggep source-nya JUGA MeshPhysicalMaterial (langsung
      // baca source.clearcoatNormalScale/sheenColor/dll tanpa cek ada
      // apa nggak), padahal m di sini StandardMaterial polos yg gak punya
      // field2 itu → crash "Cannot read properties of undefined". Upgrade
      // yg aman: konstruktor + parameter object, cuma isi field yg emang
      // ada di source.
      const physical = new THREE.MeshPhysicalMaterial({
        map: m.map,
        color: m.color.clone(),
        roughness: m.roughness,
        metalness: m.metalness,
        roughnessMap: m.roughnessMap,
        metalnessMap: m.metalnessMap,
        normalMap: m.normalMap,
        normalScale: m.normalScale?.clone(),
        aoMap: m.aoMap,
        aoMapIntensity: m.aoMapIntensity,
        emissive: m.emissive?.clone(),
        emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity,
        alphaMap: m.alphaMap,
        vertexColors: m.vertexColors,
        envMapIntensity: m.envMapIntensity,
        side: m.side,
        transparent: m.transparent,
        opacity: m.opacity,
        alphaTest: m.alphaTest,
        depthWrite: m.depthWrite,
        flatShading: m.flatShading,
      });
      physical.sheen = 0.15;
      physical.sheenColor.setRGB(0.6, 0.35, 0.28);
      physical.sheenRoughness = 0.6;
      physical.onBeforeCompile = (shader) => {
        // Scalp darkening: rambut card-based punya celah natural yg
        // nunjukin kulit kepala di baliknya (masalah asetnya — udah dicoba
        // "hair thickening" via duplicate mesh, gagal, lihat komentar
        // fitAndPrepareModel versi lama). Solusi lebih aman: gelapin
        // TEXTURE kulit kepalanya sendiri di area scalp, biar celah yg
        // nembus keliatan kayak "bayangan akar rambut" alami drpd kulit
        // terang nongol. Dideteksi pake POSISI VERTEX lokal (Y, sebelum
        // skinning) — bukan nebak UV layout (gak ada datanya) — dicek
        // langsung dari geometry.attributes.position mesh Face_Skin di
        // proyek ini: Y mentok 1.552–1.937 (rentang 0.386).
        //
        // Threshold-nya udah lewat beberapa iterasi visual: awalnya cuma
        // nyakup ubun2/crown (1.80–1.90), tapi celah paling ketara justru
        // di GARIS RAMBUT DEPAN (parting/hairline), yg Y-nya lebih rendah
        // dari crown — jadi diturunin ke 1.66–1.80. Percobaan pertama pake
        // mix darkness 0.15 (banyak) hasilnya malah "bocor" jadi pita gelap
        // di dahi yg KELIATAN (bukan ketutup rambut) — soalnya batas
        // hairline-vs-dahi-polos itu gradasi posisi, bukan garis tegas,
        // jadi mask berbasis Y doang gak bisa presisi 100%. Diturunin
        // intensitasnya ke mix 0.55 (lebih halus) — celah di balik rambut
        // masih keliatan lebih gelap/nyatu (kontras sama rambut item di
        // sekitarnya udah cukup nyamarin), tapi dahi yg beneran keliatan
        // gak collateral damage.
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', `varying float vLocalY;\nvoid main() {`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocalY = position.y;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', `varying float vLocalY;\n${NOISE_GLSL}\nvoid main() {`)
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float scalpMask = smoothstep(1.66, 1.80, vLocalY);
            diffuseColor.rgb *= mix(1.0, 0.55, scalpMask);`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            float skinRoughVar = shNoise(vUv * 18.0) * 0.5 + shNoise(vUv * 5.0) * 0.5;
            roughnessFactor = clamp(roughnessFactor + (skinRoughVar - 0.5) * 0.22, 0.25, 0.82);`
          );
      };
      if (isArray) mesh.material[i] = physical;
      else mesh.material = physical;
    }
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/* Material — rambut (helmet cap + strand cards)                           */
/* ────────────────────────────────────────────────────────────────────── */
export function setupHairMaterial(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  mats.forEach((m) => {
    if (!m) return;
    if ('envMapIntensity' in m) m.envMapIntensity = 0.35;

    const texName = m.map?.name ?? '';
    // Strand cards (yg keliatan, di atas) vs helmet cap (base volume solid
    // di bawahnya) — clearcoat/sheen matte-treatment cuma buat cards biar
    // gak muncul cincin highlight glossy yg gak natural di seam crown.
    const isCards = /cards/i.test(texName);

    // Hair — sejarah percobaan (alphaTest/blend/depthWrite kombinasi lain
    // udah dicoba & masing2 gagal, lihat commit log kalau butuh detail):
    // transparent:true + depthWrite:false (bawaan) bikin card gak occlude
    // scalp/sesama card dgn bener → "tembus pandang". depthWrite:true
    // ngebenerin occlusion; alphaTest rendah (0.05) cuma buang fragment yg
    // BENER2 kosong; kurva alpha selebihnya di-remap smoothstep biar area
    // yg "lumayan ada isi" jadi lebih solid tanpa cutout jaggy.
    if (m.transparent) {
      m.depthWrite = true;
      m.alphaTest = 0.05;
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', `${NOISE_GLSL}\nvoid main() {`)
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            diffuseColor.a = smoothstep(0.05, 0.22, diffuseColor.a);
            // Root-to-tip tint: akar (deket scalp) sedikit lebih gelap
            // (occlusion natural), ujung sedikit lebih terang — kesan
            // volume. Asumsi konvensi UV.v: 0 = akar, 1 = ujung strand;
            // kalau pas dites arahnya kebalik, tinggal ganti vUv.y jadi
            // (1.0 - vUv.y) di baris bawah ini.
            float rootTip = clamp(vUv.y, 0.0, 1.0);
            diffuseColor.rgb *= mix(0.55, 1.25, rootTip);
            // Flyaway wispy strands: di sudut grazing (fresnel, deket
            // siluet tepi kepala) alpha di-mix sama noise, jadi tepi
            // rambut pecah dikit / gak solid kaku kayak "dicat" rata.
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - saturate(dot(normalize(vNormal), viewDir)), 3.0);
            float edgeNoise = shNoise(vUv * 45.0);
            diffuseColor.a *= mix(1.0, edgeNoise, fresnel * 0.55);`
          );
      };
    }

    // User minta rambut GAK mengkilat sama sekali → clearcoat/sheen di-nolin
    // total & roughness dinaikin (matte). Metalness SENGAJA gak dipakai
    // buat niru anisotropic shine (diminta di brief lain) — rambut bukan
    // logam; ngasih metalness bikin diffuse response ilang & reflection
    // ke-tint warna dasar, hasilnya lebih ke "plastik hitam" drpd rambut.
    // Highlight arah-strand yg diminta didapet dari root-to-tip tint +
    // shading N·L biasa, bukan dari metalness/envMap kuat.
    if (isCards) {
      m.roughness = Math.max(m.roughness, 0.85);
      m.clearcoat = 0;
      m.sheen = 0;
    }

    // Texture diffuse aslinya masih nyisain rona coklat/abu dari bake
    // asetnya begitu kena cahaya walau base color material udah gelap.
    // Paksa color multiplier ke hitam murni.
    m.color.setHex(0x000000);
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/* Character loading                                                       */
/* ────────────────────────────────────────────────────────────────────── */
export function loadCharacter(url, dracoDecoderPath, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(dracoDecoderPath);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      url,
      (gltf) => resolve({ gltf, dracoLoader }),
      onProgress,
      (err) => reject(err)
    );
  });
}

// Normalisasi skala + posisi model, plus fix dua kuirk spesifik file
// MetaHuman ini (lihat catatan di masing-masing bagian). targetSize = dimensi
// terbesar model abis di-scale (unit three.js) — Preview3D pakai 1.6 (skala
// studio), AR pakai lebih kecil biar pas sama ukuran blocking cube yg dulu
// jadi placeholder.
export function fitAndPrepareModel(model, targetSize = 1.6) {
  // Box3().setFromObject baca posisi bind-pose (lokal) + matrixWorld node
  // itu sendiri buat SkinnedMesh — bukan hasil akhir joint-deformed yang
  // beneran dirender. Di file MetaHuman ini node armature-nya punya
  // translation yang gak kepakai pas render beneran, jadi box gabungan (yg
  // ikut ngukur mesh badan yg skinned) jadi ngaco di X & Z — keukur jauh
  // lebih "lebar/dalam" dari yg aslinya keliatan. Y gak separah itu
  // (translation Y ancestor-nya kecil), dipercaya apa adanya. Buat X & Z,
  // ganti pake box dari mesh non-skinned aja (props — rambut/alis/gigi,
  // posisinya udah bener & konsisten sama tempat kepala beneran keliatan).
  const box = new THREE.Box3().setFromObject(model);
  const reliablePropsBox = new THREE.Box3();
  model.traverse((obj) => {
    if (obj.isMesh && !obj.isSkinnedMesh) reliablePropsBox.expandByObject(obj);
  });
  if (!reliablePropsBox.isEmpty()) {
    box.min.x = reliablePropsBox.min.x;
    box.max.x = reliablePropsBox.max.x;
    box.min.z = reliablePropsBox.min.z;
    box.max.z = reliablePropsBox.max.z;
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  model.scale.setScalar(scale);

  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center.multiplyScalar(scale));

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    // Sama root cause kayak di atas: frustum culling pakai
    // geometry.boundingSphere + matrixWorld (yg bogus buat mesh badan yg
    // skinned) buat mutusin objek itu on-screen apa nggak. Sphere-nya
    // nongkrong di tempat yg gak sesuai render aslinya, jadi mesh ke-cull
    // begitu diputar — padahal geometrinya masih keliatan. Matiin aja,
    // modelnya kecil, gak ada ruginya render terus.
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const texName = (Array.isArray(obj.material) ? obj.material[0] : obj.material)?.map?.name ?? '';
    const isHair = /hair/i.test(texName) || /hair/i.test(obj.name);

    if (isHair) setupHairMaterial(obj);
    else setupMaterials(obj);
  });

  const minY = box.min.y * scale + model.position.y;
  return { minY };
}
