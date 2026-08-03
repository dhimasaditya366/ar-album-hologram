/**
 * Preview3D.jsx
 *
 * Preview 3D biasa (bukan AR) — dipakai sementara sebelum AR-nya jadi.
 * Load model MetaHuman (GLB, di-convert dari FBX + shape key statis udah di-prune)
 * dan diputar/di-zoom bebas pakai OrbitControls (mouse drag / touch / scroll).
 *
 * Studio/portfolio-grade render setup: three-point + rim lighting, soft
 * contact shadow, PMREM environment reflections, ACES tone mapping.
 * Struktur modular — tiap bagian (renderer/camera/lighting/ground/karakter)
 * punya fungsi setup sendiri di bawah, di-orkestrasi dari useEffect.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  MODEL_URL,
  DRACO_DECODER_PATH,
  setupLighting,
  loadCharacter,
  fitAndPrepareModel,
  setupGround,
} from '../three/character.js';

// HDRI asli (RGBELoader) belum ada file .hdr di proyek ini — daripada nebak/
// fetch file dari internet, environment reflection dibikin lewat
// RoomEnvironment (procedural, built-in three, gak butuh asset eksternal).
// Kalau nanti ada file .hdr yang mau dipakai, taruh di public/assets/ dan isi
// HDRI_URL di bawah — setupEnvironment() otomatis pindah ke RGBELoader.
const HDRI_URL = null; // contoh: import.meta.env.BASE_URL + 'assets/studio.hdr'

// Set true buat nampilin light helper (arah + shadow frustum) dan panel
// lil-gui buat tuning intensity/posisi light secara real-time.
const DEBUG = false;

/* ────────────────────────────────────────────────────────────────────── */
/* Renderer                                                                */
/* ────────────────────────────────────────────────────────────────────── */
function setupRenderer(container, width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 1.1 kemarin bikin skin & rambut overexposed (flat, "digital light box"),
  // makanya diturunin ke 0.92. User minta naik lagi ke ~1.1 belakangan tanpa
  // kasih angka pasti ("something in between") — 1.0 dipilih sbg titik
  // tengah: sedikit lebih terang dari 0.92 tapi gak balik ke 1.1 yg udah
  // kebukti overexposed.
  renderer.toneMappingExposure = 1.0;
  // three@0.147 pakai API lama (outputEncoding); versi three yg lebih baru
  // ganti nama jadi outputColorSpace = THREE.SRGBColorSpace — efeknya sama.
  renderer.outputEncoding = THREE.sRGBEncoding;

  container.appendChild(renderer.domElement);
  return renderer;
}

/* ────────────────────────────────────────────────────────────────────── */
/* Camera                                                                   */
/* ────────────────────────────────────────────────────────────────────── */
function setupCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 100);
  // Sedikit di atas eye-level karakter, diagonal — bukan lurus depan flat.
  // fov sempit (36 vs default three.js 50/60) butuh jarak lebih jauh buat
  // framing yg sama — jangan disamain angka posisi kalau ganti fov.
  camera.position.set(1.17, 0.76, 3.32);
  return camera;
}

// Framing rule-of-thirds TANPA distorsi perspektif: geser jendela render
// (bukan posisi/rotasi kamera) pakai setViewOffset, jadi karakter jatuh di
// sepertiga kiri/kanan frame, nyisain ruang kosong di sisi satunya.
function applyRuleOfThirds(camera, width, height) {
  const shiftX = width * 0.14; // + = subjek geser ke kiri frame
  const shiftY = -height * 0.05; // sedikit ke atas (ruang di bawah dagu/bahu)
  camera.setViewOffset(width, height, shiftX, shiftY, width, height);
}

/* ────────────────────────────────────────────────────────────────────── */
/* Environment reflections (PMREM)                                         */
/* ────────────────────────────────────────────────────────────────────── */
async function setupEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let envTexture;
  if (HDRI_URL) {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    const hdrTexture = await new RGBELoader().loadAsync(HDRI_URL);
    envTexture = pmrem.fromEquirectangular(hdrTexture).texture;
    hdrTexture.dispose();
  } else {
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }

  scene.environment = envTexture;
  pmrem.dispose();
  return envTexture;
}

// Background studio: vignette radial halus (bukan polos flat), digambar ke
// CanvasTexture — gak butuh asset gambar eksternal.
function createStudioBackground() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(
    size / 2, size * 0.42, size * 0.05,
    size / 2, size * 0.5, size * 0.72
  );
  grad.addColorStop(0, '#232b3d');
  grad.addColorStop(0.55, '#141a26');
  grad.addColorStop(1, '#05070b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  // three@0.147 API lama; versi lebih baru pakai texture.colorSpace = THREE.SRGBColorSpace.
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

/* ────────────────────────────────────────────────────────────────────── */
/* Component                                                                */
/* ────────────────────────────────────────────────────────────────────── */
export default function Preview3D({ onBack }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Loading model...');

  useEffect(() => {
    const container = containerRef.current;
    let W = container.clientWidth;
    let H = container.clientHeight;

    const renderer = setupRenderer(container, W, H);
    const camera = setupCamera(W, H);
    applyRuleOfThirds(camera, W, H);

    const scene = new THREE.Scene();
    scene.background = createStudioBackground();
    // Fog tipis, warna senada background navy gelap — nambah depth cue
    // (karakter jauh dari kamera dikit "menyatu" ke background), bukan buat
    // nyembunyiin apa2 (density kecil, karakter deket kamera nyaris gak
    // kena). FogExp2 (eksponensial) dipilih drpd Fog linear biar falloff-nya
    // lembut, gak ada garis batas fog yg keliatan.
    scene.fog = new THREE.FogExp2(0x05070b, 0.05);

    const lighting = setupLighting(scene, { debug: DEBUG });
    let envTexture = null;
    setupEnvironment(renderer, scene).then((tex) => { envTexture = tex; });

    const grid = DEBUG ? new THREE.GridHelper(4, 8, 0x223344, 0x18202e) : null;
    if (grid) scene.add(grid);

    /* ── OrbitControls: drag = rotate, scroll/pinch = zoom ── */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.1, 0); // dada/leher karakter
    controls.minDistance = 1.2;
    controls.maxDistance = 6;
    // Batasin polar angle biar kamera gak bisa muter sampe ke bawah
    // karakter — bust/half-body model kayak gini gak dimodelin bagian
    // dalemnya (baju/badan kosong di bawah), jadi kalau kamera nembus ke
    // situ (dulu gak ada batasan sama sekali) yg keliatan rongga kosong yg
    // "patah". minPolarAngle 0.15 nyegah lurus dari atas juga (headroom
    // aneh), maxPolarAngle 1.55 rad (~89°, hampir tapi gak sampe sejajar
    // mata) nyegah turun ke level mata apalagi ke bawah.
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = 1.55;
    controls.update();

    let mixer = null;
    let model = null;
    let dracoLoaderRef = null;
    let ground = null;
    let cancelled = false;

    loadCharacter(MODEL_URL, DRACO_DECODER_PATH, {
      onProgress: (evt) => {
        if (evt.lengthComputable) {
          const pct = ((evt.loaded / evt.total) * 100).toFixed(0);
          setStatus(
            evt.loaded >= evt.total
              ? 'Download 100% — parsing GLB...'
              : `Downloading model... ${pct}% (${(evt.loaded / 1048576).toFixed(1)}MB)`
          );
        } else {
          setStatus(`Downloading model... ${(evt.loaded / 1048576).toFixed(1)}MB`);
        }
      },
    })
      .then(({ gltf, dracoLoader }) => {
        if (cancelled) { dracoLoader.dispose(); return; }
        dracoLoaderRef = dracoLoader;
        model = gltf.scene;

        const { minY } = fitAndPrepareModel(model);
        scene.add(model);
        ground = setupGround(scene, minY);

        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
        }

        setStatus(`Model loaded${gltf.animations?.length ? ' — animasi: ' + gltf.animations[0].name : ''}`);
      })
      .catch((err) => {
        console.error(err);
        setStatus('ERROR load model: ' + (err?.message ?? String(err)));
      });

    // Panel lil-gui buat tuning intensity/posisi light real-time — cuma
    // di-load (dynamic import) kalau DEBUG true, gak nambah bundle size di
    // production.
    let disposeGui = () => {};
    if (DEBUG) {
      import('lil-gui').then(({ default: GUI }) => {
        if (cancelled) return;
        const gui = new GUI();
        const { key, fill, rim, hemi } = lighting;

        const keyFolder = gui.addFolder('Key light');
        keyFolder.add(key, 'intensity', 0, 3, 0.05);
        keyFolder.add(key.position, 'x', -5, 5, 0.1);
        keyFolder.add(key.position, 'y', -5, 5, 0.1);
        keyFolder.add(key.position, 'z', -5, 5, 0.1);

        const fillFolder = gui.addFolder('Fill light');
        fillFolder.add(fill, 'intensity', 0, 2, 0.05);
        fillFolder.addColor({ color: fill.color.getHex() }, 'color')
          .onChange((v) => fill.color.setHex(v));

        const rimFolder = gui.addFolder('Rim light');
        rimFolder.add(rim, 'intensity', 0, 3, 0.05);
        rimFolder.add(rim.position, 'x', -5, 5, 0.1);
        rimFolder.add(rim.position, 'y', -5, 5, 0.1);
        rimFolder.add(rim.position, 'z', -5, 5, 0.1);

        const ambientFolder = gui.addFolder('Ambient');
        ambientFolder.add(hemi, 'intensity', 0, 1, 0.02);

        const rendererFolder = gui.addFolder('Renderer');
        rendererFolder.add(renderer, 'toneMappingExposure', 0, 3, 0.05);

        disposeGui = () => gui.destroy();
      });
    }

    const onResize = () => {
      W = container.clientWidth;
      H = container.clientHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      applyRuleOfThirds(camera, W, H);
      renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    let raf;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      disposeGui();
      controls.dispose();
      envTexture?.dispose();
      scene.background?.dispose?.();
      ground?.geometry.dispose();
      (Array.isArray(ground?.material) ? ground.material : [ground?.material]).forEach((m) => {
        m?.map?.dispose();
        m?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      dracoLoaderRef?.dispose();
      mixer?.stopAllAction();
      if (model) {
        model.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => m?.dispose());
          }
        });
      }
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Vignette — awalnya dicoba via EffectComposer (WebGL post-process,
          sesuai request), tapi ternyata bikin dua regresi nyata: pinggiran
          shirt/leher jadi z-fighting (garis-garis belang aneh, kemungkinan
          precision depth-buffer intermediate render target beda dari canvas
          asli) dan keseluruhan frame jadi gelap banget (color/tone-mapping
          gak konsisten lewat composer). Overlay CSS radial-gradient di atas
          canvas ngasih efek visual yg sama (fokus ketarik ke wajah) tanpa
          resiko WebGL itu — pointer-events:none jadi gak ganggu drag/zoom
          OrbitControls di canvas di baliknya. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 100,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.38) 100%)',
      }} />

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 300,
        background: 'rgba(0,0,0,0.55)', color: '#00e5ff',
        fontSize: 12, fontFamily: 'monospace',
        padding: '4px 10px', borderRadius: 6,
        pointerEvents: 'none',
      }}>
        Preview 3D — drag utk putar, scroll/pinch utk zoom
        <br />
        {status}
      </div>

      {onBack && (
        <button onClick={onBack} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 300,
          background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff', borderRadius: 10, padding: '6px 16px', fontSize: 13,
          fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          ← Back
        </button>
      )}
    </div>
  );
}
