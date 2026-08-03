import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARScene from './components/ARScene';
import ARScanGate from './components/ARScanGate';
import Preview3D from './components/Preview3D';
import MultiAngleViewer from './components/MultiAngleViewer';

export default function App() {
  const [selected, setSelected] = useState(null);
  // Gate scan buat 'preview3d' — di-reset bareng handleBack, jadi tiap kali
  // menu ini dipilih ulang dari Dashboard, user scan cover album lagi dari
  // awal (bukan langsung nyangkut ke Preview3D dari sesi sebelumnya).
  const [scanned, setScanned] = useState(false);

  if (!selected) {
    return <Dashboard onSelect={setSelected} />;
  }

  const handleBack = () => {
    setScanned(false);
    setSelected(null);
  };

  if (selected.type === 'preview3d') {
    // Konsep scan sama kayak menu AR: harus scan cover album dulu, begitu
    // ke-detect baru pindah ke Preview3D (bukan overlay kamera) — isinya
    // identik sama AR krn dua2nya load model+lighting dari character.js
    // yg sama.
    if (!scanned) {
      return <ARScanGate onFound={() => setScanned(true)} onBack={handleBack} />;
    }
    return <Preview3D onBack={handleBack} />;
  }

  if (selected.type === 'multiangle') {
    return <MultiAngleViewer onBack={handleBack} />;
  }

  const videoSrc = import.meta.env.BASE_URL + 'assets/' + encodeURIComponent(selected.videoFile);

  return (
    <ARScene
      videoSrc={videoSrc}
      onBack={handleBack}
    />
  );
}
