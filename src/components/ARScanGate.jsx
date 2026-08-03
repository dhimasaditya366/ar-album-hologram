/**
 * ARScanGate.jsx
 *
 * Gate scan buat menu "Preview 3D": user scan cover album dulu (MindAR image
 * tracking, sama persis kayak ARScene), begitu target ke-detect App.jsx
 * pindah ke Preview3D (bukan ke overlay hologram kamera). Isi yg keluar di
 * Preview3D otomatis identik sama yg dipakai di AR — dua2nya load model +
 * lighting lewat character.js yg sama.
 *
 * SENGAJA gak ada Three.js overlay/hologram di sini — cuma kamera + deteksi
 * target doang, jadi gak ada render loop per-frame yg perlu dijalanin (beda
 * dari ARScene yg juga ngerender hologram overlay tiap frame).
 */

import { useEffect, useRef, useState } from 'react';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

export default function ARScanGate({ onFound, onBack }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Initializing...');
  const [ready,  setReady]  = useState(false);
  const [found,  setFound]  = useState(false);

  const handleBack = () => {
    sessionStorage.removeItem('sw-reloaded');
    window.location.reload();
  };

  useEffect(() => {
    const container = containerRef.current;
    let mindarThree = null;
    let destroyed = false;
    let foundTimer = null;
    // Guard re-entry pakai variabel lokal (bukan state `found`) — closure
    // anchor.onTargetFound dibikin sekali pas effect jalan, jadi baca state
    // React di sini bakal selalu keliatan versi awal (stale closure). Sama
    // pola kayak `hologramGroup.visible` guard di ARScene.jsx.
    let foundLocal = false;

    const init = async () => {
      setStatus('Loading AR engine...');
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: import.meta.env.BASE_URL + 'assets/targets.mind',
        maxTrack: 1,
        uiLoading: 'yes',
        uiScanning: 'no', // overlay scanning sendiri, sama kayak ARScene
        uiError:    'yes',
        filterMinCF: 0.001,
        filterBeta:  0.01,
      });

      const anchor = mindarThree.addAnchor(0);
      anchor.onTargetFound = () => {
        if (foundLocal) return;
        foundLocal = true;
        setFound(true);
        setStatus('Target found!');
        // Delay dikit biar user sempet liat konfirmasi "Target found!"
        // sebelum layar ganti ke Preview3D — transisi instan kesannya
        // "loncat" tanpa feedback scan-nya kerasa.
        foundTimer = setTimeout(() => { if (!destroyed) onFound(); }, 500);
      };
      anchor.onTargetLost = () => {};

      setStatus('Starting camera...');
      await mindarThree.start();
      // stop() di mind-ar SYNCHRONOUS, balikin undefined (bukan Promise) —
      // `.catch()` di baris ini nge-throw TypeError kalau dipanggil apa
      // adanya. try/catch biasa, bukan promise chain.
      if (destroyed) { try { mindarThree.stop(); } catch { /* ignore */ } return; }

      setStatus('Scanning... (arahkan ke cover album)');
      setReady(true);
    };

    init().catch(err => {
      console.error(err);
      setStatus('ERROR: ' + (err?.message ?? String(err)));
    });

    return () => {
      destroyed = true;
      clearTimeout(foundTimer);
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        // Sama kayak di atas: stop() sync & gak balikin Promise, jangan
        // .catch() ini. Ini bug yg bikin transisi ke Preview3D crash total
        // (React unmount seluruh root krn error gak ke-tangkep di effect
        // cleanup → layar item jadi hitam polos) — root cause "gelap hitam
        // aja" pas abis scan.
        try { mindarThree.stop(); } catch { /* ignore */ }
      }
    };
  }, [onFound]);

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

      {/* Scanning overlay — muncul saat kamera siap & target belum ke-detect */}
      {ready && !found && (
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
    </div>
  );
}
