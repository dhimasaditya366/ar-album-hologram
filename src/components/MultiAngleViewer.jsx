/**
 * MultiAngleViewer.jsx
 *
 * "Bullet-time" video viewer — pengganti render 3D real-time yang berat.
 * MetaHuman di-render dari Blender jadi beberapa video sudut kamera tetap,
 * diurutin di ANGLES muter penuh 360° (ujung terakhir nyambung balik ke
 * Depan). Drag WRAP-AROUND — abis titik terakhir, lanjut drag balik lagi
 * ke Depan (index 0), muter bebas terus kiri/kanan. Cuma 1 video yang
 * aktif/play tiap saat — hemat CPU/baterai dibanding muter semuanya barengan.
 *
 * Anti-flicker: pas drag switch sudut, video LAMA di-pause dulu (freeze,
 * bukan lanjut jalan) di detik itu juga, video BARU di-seek ke detik yang
 * sama lalu ditunggu event 'seeked' (nandain frame udah bener2 ke-decode).
 * Baru setelah itu video baru ditampilin (opacity naik) + di-play, video
 * lama disembunyiin. Jadi gak pernah ada momen frame kosong/nyangkut —
 * paling cuma freeze sesaat (~puluhan ms, tergantung jarak ke keyframe
 * terdekat di video) sebelum lanjut ke sudut baru.
 *
 * Nambah sisi lebih banyak nanti: tinggal tambah entry di ANGLES,
 * makin banyak sisi makin halus efek putarnya.
 *
 * Asset di /public/assets/angles/: <id>.mp4 sesuai ANGLES di bawah.
 */

import { useEffect, useRef, useState } from 'react';

const ANGLES = [
  { id: 'front', file: 'front.mp4', label: 'Depan' },
  { id: 'diag1', file: 'diag1.mp4', label: 'Serong 1' },
  { id: 'diag2', file: 'diag2.mp4', label: 'Serong 2' },
  { id: 'diag3', file: 'diag3.mp4', label: 'Serong 3' },
  { id: 'left',  file: 'left.mp4',  label: 'Kiri' },
  { id: '2.1',   file: 's2.1.mp4',  label: '2.1' },
  { id: '2.2',   file: 's2.2.mp4',  label: '2.2' },
  { id: '2.3',   file: 's2.3.mp4',  label: '2.3' },
  { id: '2.4',   file: 's2.4.mp4',  label: '2.4' },
  { id: '3.0',   file: 's3.0.mp4',  label: '3.0' },
  { id: '3.1',   file: 's3.1.mp4',  label: '3.1' },
  { id: '3.2',   file: 's3.2.mp4',  label: '3.2' },
  { id: '3.3',   file: 's3.3.mp4',  label: '3.3' },
  { id: '3.4',   file: 's3.4.mp4',  label: '3.4' },
  { id: '4.0',   file: 's4.0.mp4',  label: '4.0' },
  { id: '4.1',   file: 's4.1.mp4',  label: '4.1' },
];
// '4.2' dihapus — angle-nya sama persis kayak 'front' (rotasi udah muter penuh
// 360° balik ke depan), videonya udah dipindah jadi isi front.mp4.

const DRAG_STEP_PX = 80;      // geser sekian px = pindah 1 sudut
const SEEK_TIMEOUT_MS = 500;  // fallback kalo event 'seeked' gak nembak (jaga2)

export default function MultiAngleViewer({ onBack }) {
  const videoRefs = useRef([]);
  const visibleIndexRef = useRef(0);
  const [visibleIndex, setVisibleIndexState] = useState(0);
  const [status, setStatus] = useState('Loading videos...');
  const dragStartX = useRef(null);
  const switchingRef = useRef(false);
  const queuedIndexRef = useRef(null);

  const setVisibleIndex = (i) => {
    visibleIndexRef.current = i;
    setVisibleIndexState(i);
  };

  useEffect(() => {
    let loadedCount = 0;
    const onCanPlay = () => {
      loadedCount++;
      if (loadedCount >= ANGLES.length) setStatus(`Sisi: ${ANGLES[0].label}`);
    };
    videoRefs.current.forEach(v => v?.addEventListener('canplaythrough', onCanPlay, { once: true }));

    videoRefs.current[0]?.play().catch(() => {});

    return () => {
      videoRefs.current.forEach(v => v?.removeEventListener('canplaythrough', onCanPlay));
    };
  }, []);

  const performSwitch = (newIndex) => {
    const fromIndex = visibleIndexRef.current;
    if (newIndex === fromIndex) return;

    const from = videoRefs.current[fromIndex];
    const to   = videoRefs.current[newIndex];
    if (!from || !to) return;

    switchingRef.current = true;

    // Freeze video lama di detik ini juga — biar gak drift pas nunggu seek video baru.
    from.pause();
    const t = from.currentTime;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      to.removeEventListener('seeked', onSeeked);
      clearTimeout(timeoutId);

      to.play().catch(() => {});
      setVisibleIndex(newIndex);
      setStatus(`Sisi: ${ANGLES[newIndex].label}`);
      switchingRef.current = false;

      // Kalo pas nunggu ada drag lanjutan numpuk, lanjutin ke situ.
      if (queuedIndexRef.current !== null && queuedIndexRef.current !== newIndex) {
        const next = queuedIndexRef.current;
        queuedIndexRef.current = null;
        performSwitch(next);
      } else {
        queuedIndexRef.current = null;
      }
    };

    const onSeeked = () => finish();
    to.addEventListener('seeked', onSeeked);
    const timeoutId = setTimeout(finish, SEEK_TIMEOUT_MS);

    to.currentTime = t;
  };

  const switchTo = (newIndex) => {
    if (newIndex === visibleIndexRef.current) return;
    if (switchingRef.current) {
      queuedIndexRef.current = newIndex; // simpan target terbaru, diproses abis switch skrg kelar
      return;
    }
    performSwitch(newIndex);
  };

  const onPointerDown = (e) => {
    dragStartX.current = e.clientX;
  };
  const onPointerMove = (e) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) < DRAG_STEP_PX) return;

    // Wrap-around: mentok di ujung salah satu arah, lanjut drag lompat balik
    // ke ujung satunya (belum full 360 fisik, jadi ini jump-cut) — biar
    // kerasa bisa muter bebas terus kiri/kanan.
    const dir = dx < 0 ? 1 : -1;
    const base = queuedIndexRef.current ?? visibleIndexRef.current;
    const newIndex = (base + dir + ANGLES.length) % ANGLES.length;
    switchTo(newIndex);
    dragStartX.current = e.clientX; // reset biar butuh drag DRAG_STEP_PX lagi buat lompat berikutnya
  };
  const onPointerUp = () => {
    dragStartX.current = null;
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        width: '100%', height: '100%', position: 'relative',
        background: '#000', touchAction: 'none', userSelect: 'none',
      }}
    >
      {ANGLES.map((a, i) => (
        <video
          key={a.id}
          ref={el => (videoRefs.current[i] = el)}
          src={import.meta.env.BASE_URL + 'assets/angles/' + a.file}
          loop
          muted
          playsInline
          preload="auto"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'contain',
            opacity: i === visibleIndex ? 1 : 0,
            zIndex: i === visibleIndex ? 2 : 1,
            pointerEvents: 'none',
          }}
        />
      ))}

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 300,
        background: 'rgba(0,0,0,0.55)', color: '#00e5ff',
        fontSize: 12, fontFamily: 'monospace',
        padding: '4px 10px', borderRadius: 6,
        pointerEvents: 'none',
      }}>
        Drag kiri/kanan utk putar
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
