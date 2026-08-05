/**
 * character.js
 *
 * Setup bareng buat render karakter MetaHuman (lighting + material fixes +
 * stage/ground + loader) — dipakai bareng sama Preview3D.jsx (non-AR, full
 * studio setup) dan ARScene.jsx (AR, nimpa live camera feed). Diekstrak dari
 * Preview3D.jsx biar dua tempat itu gak perlu duplikat & drift logic-nya.
 *
 * Yang TETEP beda antara Preview3D & AR (sengaja gak di sini): scene
 * .background (Preview3D studio backdrop vs AR camera feed asli), fog, sama
 * CSS vignette — ketiganya emang cuma masuk akal buat backdrop studio yg
 * terkontrol, gak relevan buat overlay yg nimpa dunia nyata.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export const MODEL_URL = import.meta.env.BASE_URL + 'assets/mh_dimas_optimized.glb';
export const DRACO_DECODER_PATH = import.meta.env.BASE_URL + 'assets/draco/gltf/';

/* ────────────────────────────────────────────────────────────────────── */
/* Lighting — three-point (key/fill/rim) + hemisphere fill                 */
/* ────────────────────────────────────────────────────────────────────── */
export function setupLighting(scene, { debug = false, castShadow = true, intensityScale = 1 } = {}) {
  const helpers = [];

  // intensityScale: dipakai AR (lihat ARScene.jsx) buat naikin brightness
  // di atas nilai default. Preview3D adalah studio backdrop gelap terkontrol
  // — nilai default (1.05/0.33/0.6/0.2) udah pas di situ. AR nimpa live
  // camera feed yg exposure/white-balance-nya di-handle OTOMATIS sama
  // kamera HP & bisa jauh lebih terang dari studio backdrop kita (ruangan
  // indoor biasa dll) — light rig FIXED yg sama persis jadi keliatan gelap
  // dibanding real-world di sekitarnya. Preview3D tetep manggil tanpa param
  // ini (default 1, gak berubah).
  const s = intensityScale;

  // Key — sumber cahaya utama, diagonal atas-depan, satu-satunya yg cast
  // shadow (fill/rim gak usah, biar shadow gak dobel/berantakan).
  // Diturunin dikit dari 1.05 ke 0.95 — bagian dari retune rig ke arah
  // "bright flat high-key" (nyamain mood ke video Menu 4/MultiAngleViewer,
  // yg pre-rendered Blender & keliatan nyaris shadowless/flat drpd studio
  // moody 3-point kayak sebelumnya). Fill+hemi di bawah dinaikin BANYAK
  // buat ngangkat shadow-side, jadi key gak perlu setinggi dulu buat tetep
  // jadi sumber dominan.
  const key = new THREE.DirectionalLight(0xffffff, 0.95 * s);
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

  // Fill — lawan arah key, posisi digeser ke depan (Z positif, deket sama
  // key yg di Z=1.4) biar bener2 "ngangkat" rahang kiri yg jadi sisi
  // berlawanan dari key light, bukan cuma ngisi ambient belakang yg gak
  // kena rahang. Intensity dinaikin GEDE (0.33 → 0.75) & warna dinetralin
  // (0xdce6ff kebiruan → 0xfff3e8 netral-hangat) — retune ke high-key flat
  // (referensi: video Menu 4/MultiAngleViewer, hampir gak ada falloff
  // kiri-kanan & gak ada rona biru di shadow-nya). Fill setinggi ini
  // sengaja ngerata-in kontras key-vs-fill yg dulu kuat.
  const fill = new THREE.DirectionalLight(0xfff3e8, 0.75 * s);
  fill.position.set(-1.3, 0.85, 0.9);
  fill.target.position.set(0, 0.1, 0);
  scene.add(fill, fill.target);

  // Rim/back — di belakang-atas karakter, buat highlight siluet rambut & bahu.
  // Diturunin (0.6 → 0.28) & warna dinetralin (0xfff4e0 keemasan → 0xffffff
  // putih polos) — referensi Menu 4 (video) rambutnya keliatan flat matte
  // TANPA edge-glow keemasan sama sekali, jadi rim di-retune biar cuma
  // nyisain highlight tipis buat misahin siluet dari background, bukan
  // elemen "glow" yg mencolok kayak sebelumnya.
  const rim = new THREE.DirectionalLight(0xffffff, 0.28 * s);
  rim.position.set(-0.3, 1.8, -1.9);
  rim.target.position.set(0, 0.2, 0);
  scene.add(rim, rim.target);

  // Hemisphere lembut — ambient yg lebih natural dari AmbientLight polos
  // (langit dari atas, pantulan lantai dari bawah). Intensity dinaikin
  // GEDE (0.2 → 0.5) & warnanya dinetralin/dicerahin (sky kebiruan pekat →
  // lebih putih-lembut, ground coklat nyaris item → abu-hangat) — bagian
  // dari retune high-key: ambient fill setinggi ini yg bikin shadow gak
  // pernah jatuh gelap total, mendekati kesan "flat softbox" di video
  // Menu 4.
  const hemi = new THREE.HemisphereLight(0xeef2f7, 0x3a332e, 0.5 * s);
  scene.add(hemi);

  // Soft side fill (kiri & kanan wajah) — diminta krn pipi kadang masih
  // agak gelap walau key+fill+hemi udah ada; dua-duanya lebih ke arah
  // depan-diagonal, bukan bener2 dari SAMPING wajah. Pakai PointLight
  // (bukan DirectionalLight) krn PointLight punya falloff jarak alami
  // (decay) — mirip softbox fisik yg ditaruh DEKET subjek, hasilnya lembut
  // & localized, bukan nyorot rata dari "jarak tak-hingga" kayak
  // directional (kesannya lebih graphic/flat kalau dipake buat side-fill
  // gini). Posisi Z≈0.05 (nyaris murni samping, dikit aja ke depan) —
  // SENGAJA bukan di depan wajah (itu tugas key/fill), biar gak "direct
  // nembak muka", lebih ke wrap pipi dari samping. Intensity rendah +
  // gak castShadow biar soft, gak nambah kontras/shadow baru.
  const sideLeft = new THREE.PointLight(0xfff2e0, 0.32 * s, 4, 2);
  sideLeft.position.set(-1.4, 0.3, 0.05);
  scene.add(sideLeft);

  const sideRight = new THREE.PointLight(0xfff2e0, 0.32 * s, 4, 2);
  sideRight.position.set(1.4, 0.3, 0.05);
  scene.add(sideRight);

  if (debug) {
    const keyHelper = new THREE.DirectionalLightHelper(key, 0.3, 0xff5555);
    const fillHelper = new THREE.DirectionalLightHelper(fill, 0.3, 0x55aaff);
    const rimHelper = new THREE.DirectionalLightHelper(rim, 0.3, 0x55ff88);
    const sideLeftHelper = new THREE.PointLightHelper(sideLeft, 0.1, 0xffcc88);
    const sideRightHelper = new THREE.PointLightHelper(sideRight, 0.1, 0xffcc88);
    scene.add(keyHelper, fillHelper, rimHelper, sideLeftHelper, sideRightHelper);
    helpers.push(keyHelper, fillHelper, rimHelper, sideLeftHelper, sideRightHelper);
    if (castShadow) {
      const shadowHelper = new THREE.CameraHelper(key.shadow.camera);
      scene.add(shadowHelper);
      helpers.push(shadowHelper);
    }
  }

  return { key, fill, rim, hemi, sideLeft, sideRight, helpers };
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

    // Mata (cornea) — semua custom treatment (clearcoat/emissive/flat-color/
    // MeshBasicMaterial/polygonOffset, berbagai percobaan) di-REVERT total
    // atas permintaan user, balik ke material bawaan GLB apa adanya (cuma
    // kena envMapIntensity=0.55 generic di atas, sama kayak material lain
    // yg gak ke-match kategori manapun di bawah ini).

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
            // Threshold diketatin (0.05–0.22 → 0.02–0.13 → 0.02–0.06) — di
            // background/ambient GELAP (setup lama) gap tipis antar-card gak
            // kerasa krn nyatu ke gelap; begitu scene di-retune ke bright/
            // high-key, gap yg sama jadi lebih exposed & rambut keliatan
            // "tipis/renggang" — batas atas diturunin ke 0.13 buat nutup gap.
            // TAPI itu nyisain range ramp yg lumayan lebar (0.02–0.13), jadi
            // banyak texel yg lolos alphaTest (0.05) tapi alpha hasil
            // remap-nya masih PECAHAN (bukan ~1), dan itu keliatan sbg
            // rambut "nge-blend tembus" (haze) dari depan — bukan gap
            // kosong lagi, tapi transparan-blur. Range dipersempit lagi ke
            // 0.02–0.06 biar kurvanya curam: begitu ngelewatin alphaTest,
            // langsung cepet jenuh ke alpha ~1 (solid), gak nyisa zona
            // "separuh transparan" yg lebar.
            diffuseColor.a = smoothstep(0.02, 0.06, diffuseColor.a);
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
            // Faktor fresnel diturunin 0.55 → 0.28 — sama alasan kayak
            // threshold di atas: efek wispy ini kena area LUAS di kepala
            // bulat (fresnel tinggi di banyak sudut normal, bukan cuma
            // siluet tepi doang), jadi di background terang efeknya
            // kebaca sbg rambut tipis merata, bukan cuma flyaway di tepi.
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - saturate(dot(normalize(vNormal), viewDir)), 3.0);
            float edgeNoise = shNoise(vUv * 45.0);
            diffuseColor.a *= mix(1.0, edgeNoise, fresnel * 0.28);`
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

/* ────────────────────────────────────────────────────────────────────── */
/* Stage/ground — platform hologram (dipake di Preview3D & AR)             */
/* ────────────────────────────────────────────────────────────────────── */
// Cincin cyan tipis (warna aksen yg sama dipake di seluruh UI app ini —
// status text, border tombol Dashboard/AR: 0x00e5ff) buat kesan "hologram
// display pad", bukan sekadar lantai abu-abu polos. Base-nya gelap & nyatu
// ke warna background studio biar gak keliatan kayak piring kotak-terpisah.
function createStageTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, size * 0.02, cx, cy, size * 0.5);
  grad.addColorStop(0, '#1c2438');
  grad.addColorStop(0.5, '#0e1422');
  grad.addColorStop(1, '#05070b'); // nyatu ke warna terluar background studio
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Ring glow, ~78% radius disc — dilapis 2x (blur lebar redup + garis
  // tajam tipis di atasnya) biar kesan "glow" bukan garis keras.
  const ringR = size * 0.39;
  ctx.strokeStyle = 'rgba(0,229,255,0.35)';
  ctx.lineWidth = size * 0.035;
  ctx.shadowColor = 'rgba(0,229,255,0.9)';
  ctx.shadowBlur = size * 0.025;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(140,240,255,0.55)';
  ctx.lineWidth = size * 0.006;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

// scale: dipakai buat jaga proporsi radius/tebal platform relatif ke ukuran
// karakter — Preview3D normalize karakter ke targetSize 1.6 & platform-nya
// dikalibrasi buat itu (radius 0.85, tebal 0.28), jadi default scale=1
// nyamain itu persis. AR normalize karakter ke targetSize LEBIH KECIL, jadi
// manggil dgn scale = (targetSize AR / 1.6) biar rasio platform-ke-karakter
// tetep sama gak kegedean/kekecilan.
export function setupGround(scene, y, { scale = 1 } = {}) {
  // Radius kecil (0.85) — dulu sempat 1.6 (lebih gede dari tinggi karakter
  // sendiri yg 1.6 unit!), tepi terdekatnya ke kamera keliatan "naik"
  // ngelewatin batas perspektif & nutupin torso karakter kayak ketutup
  // rata air.
  //
  // Disc DATAR (CircleGeometry) gak cukup buat nutupin hem baju yg jagged —
  // dari sudut nyerong/deket, celah di antara "gerigi" hem masih nembus
  // keliatan lewat tepi disc yg cuma setipis kertas. Diukur langsung dari
  // vertex mesh shirt (LOD0005): titik jagged terdalam pas di y (parameter
  // fungsi ini), titik-titik gerigi lain naik sampe ~0.17 unit world lebih
  // tinggi dari situ. Ganti ke CylinderGeometry (bukan disc) yg tebalnya
  // nutupin seluruh zona gerigi itu (karakter keliatan "muncul" dari
  // platform solid, gak ada gap jagged yg nembus dari sudut manapun), sisi
  // silinder-nya jadi "dinding" solid yg nutupin celah dari sudut
  // nyerong/deket juga. Sempat 0.28 (margin ~65% di atas 0.17) tapi
  // keliatan ketebelan secara visual — diturunin ke 0.19 (margin ~12%),
  // masih nutupin penuh zona jagged-nya, cuma marginnya lebih tipis.
  const hemBandHeight = 0.19 * scale;
  const radius = 0.85 * scale;
  const geometry = new THREE.CylinderGeometry(radius, radius, hemBandHeight, 64, 1, false);

  const topMaterial = new THREE.MeshStandardMaterial({
    map: createStageTexture(),
    roughness: 0.6,
    metalness: 0,
    envMapIntensity: 0.2,
  });
  // Sisi & bawah silinder gak butuh texture stage (gak akan keliatan dari
  // sudut normal) — warna gelap polos senada tepi texture stage/background,
  // sekadar "dinding" penutup, bukan elemen visual yg perlu didesain.
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0f18,
    roughness: 0.7,
    metalness: 0,
    envMapIntensity: 0.15,
  });

  // CylinderGeometry generate 3 material group: [0]=sisi, [1]=tutup atas,
  // [2]=tutup bawah — urutan array material HARUS ngikutin ini.
  const floor = new THREE.Mesh(geometry, [sideMaterial, topMaterial, sideMaterial]);
  // Posisi: bagian BAWAH silinder ditaruh sedikit di bawah titik jagged
  // terdalam (margin kecil), jadi permukaan ATAS otomatis naik nutupin
  // seluruh tinggi hemBandHeight di atasnya.
  const bottomMargin = 0.02 * scale;
  floor.position.y = (y - bottomMargin) + hemBandHeight / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}
