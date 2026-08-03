const AR_ITEMS = [
  {
    id: 'dummy',
    title: 'AR dummy video',
    desc: 'Hologram demo dengan video contoh',
    videoFile: 'greeting.mp4',
    icon: '🎬',
    type: 'ar',
  },
  {
    id: 'ello',
    title: 'AR ello video',
    desc: 'Hologram video Ello dari Instagram',
    videoFile: 'greeting 2.mp4',
    icon: '🎤',
    type: 'ar',
  },
  {
    id: 'preview3d',
    title: 'Preview 3D (tanpa AR)',
    desc: 'Sementara: cuma tampilin object 3D, bisa diputar & di-zoom bebas',
    icon: '🧊',
    type: 'preview3d',
  },
  {
    id: 'multiangle',
    title: 'Multi-Angle Video (4 sisi)',
    desc: 'MetaHuman dari render video 4 sudut, drag muter kayak 3D',
    icon: '🔄',
    type: 'multiangle',
  },
];

export default function Dashboard({ onSelect }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(160deg, #0a0a1a 0%, #0d1a2e 60%, #0a0a1a 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px 20px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase',
          color: 'rgba(0,229,255,0.6)', marginBottom: 10,
        }}>
          MetaPacmas
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: '#fff',
          letterSpacing: '0.05em', lineHeight: 1.2, margin: 0,
        }}>
          AR Cover Album
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8 }}>
          Pilih pengalaman AR yang ingin kamu coba
        </p>
      </div>

      {/* Cards */}
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {AR_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            style={{
              width: '100%', textAlign: 'left',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(0,229,255,0.25)',
              borderRadius: 16, padding: '20px 22px',
              cursor: 'pointer', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 18,
              transition: 'background 0.2s, border-color 0.2s',
            }}
            onPointerDown={e => e.currentTarget.style.background = 'rgba(0,229,255,0.1)'}
            onPointerUp={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onPointerLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          >
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              {item.icon}
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                {item.desc}
              </div>
            </div>
            {/* Arrow */}
            <div style={{ color: 'rgba(0,229,255,0.6)', fontSize: 18, flexShrink: 0 }}>›</div>
          </button>
        ))}
      </div>

      {/* Footer hint */}
      <p style={{
        position: 'absolute', bottom: 24,
        color: 'rgba(255,255,255,0.2)', fontSize: 11,
        letterSpacing: '0.08em',
      }}>
        Arahkan kamera ke cover album setelah memilih
      </p>
    </div>
  );
}
