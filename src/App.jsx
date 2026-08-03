import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARScene from './components/ARScene';
import Preview3D from './components/Preview3D';
import MultiAngleViewer from './components/MultiAngleViewer';

export default function App() {
  const [selected, setSelected] = useState(null);

  if (!selected) {
    return <Dashboard onSelect={setSelected} />;
  }

  const handleBack = () => setSelected(null);

  if (selected.type === 'preview3d') {
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
