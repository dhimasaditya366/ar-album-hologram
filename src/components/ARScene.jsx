/**
 * ARScene.jsx
 *
 * Flow:
 *  1. MindAR scan image target → trigger spawn blocking cube
 *  2. Cube muncul sebagai overlay 3D di atas camera feed — dipakai untuk
 *     blocking posisi/skala object metahuman sebelum modelnya dipasang
 *  3. Gyroscope (DeviceOrientation) memutar cube → efek hologram mengikuti tilt HP
 *
 * Asset di /public/assets/:
 *  targets.mind  — dari MindAR Compiler
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import {
  MODEL_URL,
  DRACO_DECODER_PATH,
  setupLighting,
  loadCharacter,
  fitAndPrepareModel,
} from '../three/character.js';

export default function ARScene({ onBack }) {
  const containerRef = useRef(null);
  const hologramRef  = useRef(null);
  const mindarRef    = useRef(null);
  const [status,  setStatus]  = useState('Initializing...');
  const [spawned, setSpawned] = useState(false);
  const [ready,   setReady]   = useState(false);

  const handleBack = () => {
    sessionStorage.removeItem('sw-reloaded');
    window.location.reload();
  };

  const handleClose = () => {
    if (hologramRef.current) hologramRef.current.visible = false;
    setSpawned(false);
    setStatus('Scanning... (arahkan ke cover album)');
  };

  useEffect(() => {
    const container = containerRef.current;

    /* ── Overlay Three.js renderer (terpisah dari MindAR) ── */
    const W = container.clientWidth;
    const H = container.clientHeight;

    const overlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    overlayRenderer.setSize(W, H);
    overlayRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    overlayRenderer.setClearColor(0x000000, 0);
    // Material fixes (skin sheen, hair matte-roughness, dll — dari
    // character.js) di-tune sambil ngeliat hasil di Preview3D, yg
    // renderer-nya pakai ACES tone mapping + exposure 1.0 + sRGB encoding.
    // Renderer AR ini gak pernah diset sama sekali (defaultnya
    // NoToneMapping + linear) — itu penyebab utama karakter keliatan
    // gelap/kusam di AR walau lighting rig-nya (setupLighting) udah sama
    // persis. Samain settingnya biar hasilnya konsisten di kedua tempat.
    overlayRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    overlayRenderer.toneMappingExposure = 1.0;
    overlayRenderer.outputEncoding = THREE.sRGBEncoding;

    overlayRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;pointer-events:none';
    container.appendChild(overlayRenderer.domElement);

    const overlayScene  = new THREE.Scene();
    const overlayCamera = new THREE.PerspectiveCamera(60, W / H, 0.01, 100);
    // Jarak digeser lebih deket (2.5 → 1.7) bareng targetSize karakter yg
    // dinaikin (lihat fitAndPrepareModel di bawah) — dulu karakter keliatan
    // kekecilan/jauh di tengah frame, sekarang lebih dominan & "di depan
    // kamera" beneran, bukan cuma titik kecil.
    overlayCamera.position.set(0, 0, 1.7);

    /* ── Lighting: pakai rig studio yg sama kayak Preview3D (key/fill/rim/
       hemi) biar konsisten look-nya sama karakter yg dipakai bareng —
       bedanya castShadow:false, soalnya gak ada ground/floor buat nangkep
       shadow di AR overlay, shadow map cuma nambah beban render sia-sia di
       HP yg udah sibuk ngolah camera feed + image tracking. ── */
    setupLighting(overlayScene, { castShadow: false });

    /* ── Hologram group (wrapper untuk gyro + float) ── */
    const hologramGroup = new THREE.Group();
    hologramGroup.visible = false;
    overlayScene.add(hologramGroup);
    hologramRef.current = hologramGroup;

    /* ── Blocking cube — placeholder posisi/skala object ── */
    const BOX_SIZE = 0.6;
    const boxGeo = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);

    const boxFill = new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.18,
        roughness: 0.6,
        metalness: 0.1,
      })
    );
    hologramGroup.add(boxFill);

    const boxEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0x00e5ff })
    );
    hologramGroup.add(boxEdges);

    /* ── Karakter asli (MetaHuman) — load paralel sama init MindAR di
       bawah, gantiin blocking cube begitu selesai. Reuse loader + material
       fixes (skin sheen/roughness noise, hair matte/alpha/scalp-darkening)
       yg sama persis kayak Preview3D lewat modul character.js — TAPI gak
       ada scene.background/fog/ground/vignette CSS kayak Preview3D, karena
       di AR yg jadi "background" itu live camera feed asli, bukan studio
       backdrop; environment reflection (PMREM) juga di-skip — gak ada HDRI
       yg relevan buat direfleksiin di sini & nambah beban render/loading
       yg gak sepadan buat overlay AR ringan. Kalau load gagal (network/
       parsing error), boxFill/boxEdges TETEP keliatan sbg fallback biar AR
       gak nampilin kekosongan. */
    let characterModel = null;
    let mixer = null;
    let dracoLoaderRef = null;
    let modelCancelled = false;

    loadCharacter(MODEL_URL, DRACO_DECODER_PATH, {})
      .then(({ gltf, dracoLoader }) => {
        if (modelCancelled) { dracoLoader.dispose(); return; }
        dracoLoaderRef = dracoLoader;
        characterModel = gltf.scene;

        // 0.5 kemarin (dikira "muat di dalem BOX_SIZE 0.6") ternyata
        // keliatan kekecilan begitu dites beneran di AR — cube-nya kubus
        // rata di 0.6 semua sisi, tapi karakter bust yg tinggi/kurus kalau
        // di-normalize ke 0.5 di sisi TERPANJANG-nya jadi keliatan jauh
        // lebih kecil secara visual drpd cube-nya. Naikin ke 0.85 (bareng
        // kamera yg digeser lebih deket di atas) biar karakter dominan di
        // frame, gak cuma titik kecil.
        fitAndPrepareModel(characterModel, 0.85);
        hologramGroup.add(characterModel);
        boxFill.visible = false;
        boxEdges.visible = false;

        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(characterModel);
          mixer.clipAction(gltf.animations[0]).play();
        }
      })
      .catch((err) => {
        console.error('Gagal load karakter AR, fallback ke blocking cube:', err);
      });

    /* ── Gyroscope ── */
    let gyroX = 0, gyroY = 0;   // target rotation (rad)
    let curX  = 0, curY  = 0;   // current smoothed rotation

    const onOrientation = (e) => {
      const beta  = e.beta  ?? 0;   // tilt maju/mundur  (-180 ~ 180)
      const gamma = e.gamma ?? 0;   // tilt kiri/kanan   (-90 ~ 90)
      // Saat HP portrait tegak: beta ≈ 90 → normalize ke 0
      gyroX = THREE.MathUtils.degToRad((beta - 90) * 0.35);
      gyroY = THREE.MathUtils.degToRad(gamma       * 0.35);
    };

    // iOS 13+ butuh izin dari user gesture — coba request otomatis,
    // kalau gagal (butuh gesture) user tinggal tap layar
    const startGyro = () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', onOrientation); })
          .catch(() => {});
      } else {
        window.addEventListener('deviceorientation', onOrientation);
      }
    };
    startGyro();
    // Fallback: tap layar untuk request izin iOS
    const onTap = () => { startGyro(); container.removeEventListener('click', onTap); };
    container.addEventListener('click', onTap);

    /* ── MindAR (camera feed + image detection trigger) ── */
    let mindarThree = null;
    let destroyed   = false;
    mindarRef.current = null;

    const init = async () => {
      setStatus('Loading AR engine...');
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: import.meta.env.BASE_URL + 'assets/targets.mind',
        maxTrack: 1,
        uiLoading: 'yes',
        uiScanning: 'no',   // kita pakai overlay scanning sendiri
        uiError:    'yes',
        filterMinCF: 0.001,
        filterBeta:  0.01,
      });

      // Anchor hanya sebagai trigger — tidak add cube ke anchor
      const anchor = mindarThree.addAnchor(0);
      anchor.onTargetFound = () => {
        if (hologramGroup.visible) return;
        hologramGroup.visible = true;
        setSpawned(true);
        setStatus('Target found!');
      };
      anchor.onTargetLost = () => {}; // cube tetap tampil sampai di-close

      setStatus('Starting camera...');
      await mindarThree.start();
      mindarRef.current = mindarThree;
      if (destroyed) { mindarThree.stop().catch(() => {}); return; }

      setStatus('Scanning... (arahkan ke cover album)');
      setReady(true);

      // Fix z-index: video di bawah, overlay canvas MindAR di tengah
      const arVideo  = container.querySelector('video[autoplay]');
      const arCanvas = container.querySelector('canvas[data-engine]') ?? container.querySelector('canvas');
      if (arVideo)  arVideo.style.zIndex  = '0';
      if (arCanvas && arCanvas !== overlayRenderer.domElement) arCanvas.style.zIndex = '1';
      // Overlay renderer kita ada di z-index 10 (sudah diset di atas)

      /* ── Floating + Gyro render loop ── */
      let raf;
      const startTime = performance.now();
      let lastTime = startTime;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const now = performance.now();
        const t = (now - startTime) / 1000;
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        mixer?.update(delta);

        // Smooth gyro
        curX += (gyroX - curX) * 0.08;
        curY += (gyroY - curY) * 0.08;
        hologramGroup.rotation.x = curX;
        hologramGroup.rotation.y = curY;

        // Float animation
        hologramGroup.position.y = Math.sin(t * 1.2) * 0.06;

        overlayRenderer.render(overlayScene, overlayCamera);
      };
      animate();

      // Simpan ref raf untuk cleanup
      mindarThree._overlayRaf = raf;
      mindarThree._animate    = () => cancelAnimationFrame(raf);
    };

    init().catch(err => {
      console.error(err);
      setStatus('ERROR: ' + (err?.message ?? String(err)));
    });

    return () => {
      destroyed = true;
      mindarThree?._animate?.();
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        mindarThree.stop().catch(() => {});
      }
      overlayRenderer.dispose();
      overlayRenderer.domElement.remove();
      window.removeEventListener('deviceorientation', onOrientation);
      container.removeEventListener('click', onTap);
      boxGeo.dispose();
      boxFill.material.dispose();
      boxEdges.geometry.dispose();
      boxEdges.material.dispose();
      modelCancelled = true;
      mixer?.stopAllAction();
      dracoLoaderRef?.dispose();
      if (characterModel) {
        characterModel.traverse((obj) => {
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
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />

      {/* Status overlay */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        color: status.startsWith('ERROR') ? '#ff4d4d' : '#00e5ff',
        fontSize: 12, fontFamily: 'monospace',
        padding: '4px 10px', borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: 'calc(100% - 24px)', wordBreak: 'break-word',
      }}>
        {status}
      </div>

      {/* Scanning overlay — muncul saat kamera siap & cube belum spawn */}
      {ready && !spawned && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {/* Corner brackets */}
          {[
            { top: 0,    left: 0,    borderTop: '3px solid #fff', borderLeft:  '3px solid #fff' },
            { top: 0,    right: 0,   borderTop: '3px solid #fff', borderRight: '3px solid #fff' },
            { bottom: 0, left: 0,    borderBottom: '3px solid #fff', borderLeft:  '3px solid #fff' },
            { bottom: 0, right: 0,   borderBottom: '3px solid #fff', borderRight: '3px solid #fff' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...s }} />
          ))}
          {/* Scan line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
            animation: 'scanline 2s linear infinite',
          }} />
          {/* Label */}
          <div style={{
            position: 'absolute', bottom: '18%',
            color: 'rgba(255,255,255,0.85)', fontSize: 14,
            fontFamily: 'system-ui, sans-serif',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            animation: 'blink 2s ease-in-out infinite',
          }}>
            Arahkan ke cover album
          </div>
        </div>
      )}

      {/* Back to dashboard */}
      {onBack && (
        <button onClick={handleBack} style={{
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

      {/* Close / Despawn button — hanya muncul saat cube aktif */}
      {spawned && (
        <button onClick={handleClose} style={{
          position: 'absolute', bottom: 28, left: 20, zIndex: 300,
          background: 'rgba(255,50,50,0.15)',
          border: '1px solid rgba(255,80,80,0.7)',
          color: '#ff6060', borderRadius: 10,
          padding: '8px 20px', fontSize: 13,
          fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          letterSpacing: '0.04em', userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          ✕ Tutup
        </button>
      )}

    </div>
  );
}
