'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';

export function UploadStep() {
  const { setRawImage, setStep } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setReady(true);
        }
      })
      .catch(() => setDenied(true));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new window.Image();
        img.onload = () => {
          setRawImage(src, img.naturalWidth, img.naturalHeight);
          setStep('ai-analysis');
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [setRawImage, setStep]
  );

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
    const img = new window.Image();
    img.onload = () => {
      setRawImage(dataUrl, img.naturalWidth, img.naturalHeight);
      setStep('ai-analysis');
    };
    img.src = dataUrl;
  };

  // ─── No camera: full-screen upload fallback ──────────────────────────────
  if (denied) {
    return (
      <div className="relative h-full w-full bg-gray-950 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-2xl shadow-cyan-900/40">
            <span className="text-4xl">📷</span>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-xl mb-2">BoardScan</p>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Camera access was denied. Upload an overhead photo of your project on a grid mat.
            </p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full max-w-xs py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-base transition-all shadow-lg shadow-cyan-900/30"
          >
            Choose Photo
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (f) handleFile(f);
        }} />
      </div>
    );
  }

  // ─── Main camera screen ───────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full bg-black overflow-hidden select-none">
      {/* Camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Shutter flash */}
      {flash && (
        <div className="absolute inset-0 bg-white/80 z-50 pointer-events-none" />
      )}

      {/* Top gradient */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none" />

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

      {/* App wordmark — top left */}
      <div className="absolute top-0 left-0 right-0 flex items-center px-5 pt-12">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-black text-white text-xs shadow-lg">
            B
          </div>
          <span className="text-white font-bold text-base tracking-tight drop-shadow">BoardScan</span>
        </div>
      </div>

      {/* Viewfinder bracket guides */}
      {ready && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: '80%', aspectRatio: '4/3' }}>
            <Corner className="top-0 left-0" t r={false} b={false} l />
            <Corner className="top-0 right-0" t r b={false} l={false} />
            <Corner className="bottom-0 left-0" t={false} r={false} b l />
            <Corner className="bottom-0 right-0" t={false} r b l={false} />
          </div>
        </div>
      )}

      {/* Guidance text — floats in upper third */}
      <div className="absolute left-0 right-0 flex flex-col items-center pointer-events-none px-10"
        style={{ top: '22%' }}>
        <p className="text-white text-center font-semibold text-lg leading-snug drop-shadow-lg">
          Hold camera directly above your<br />project on the grid mat
        </p>
        <p className="text-white/50 text-center text-xs mt-2 font-medium tracking-wide">
          Keep grid lines visible around the edges
        </p>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-12 flex items-end justify-between">
        {/* Left spacer */}
        <div className="w-14" />

        {/* Shutter button — center */}
        <button
          onClick={capture}
          disabled={!ready}
          className="w-[72px] h-[72px] rounded-full border-[3px] border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
        >
          <div className="w-[56px] h-[56px] rounded-full bg-white shadow-inner" />
        </button>

        {/* Upload — bottom right */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-1.5 group"
        >
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center group-active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <polyline points="16 11 12 7 8 11" />
              <line x1="12" y1="7" x2="12" y2="17" />
            </svg>
          </div>
          <span className="text-white/70 text-[10px] font-medium tracking-wide">Upload</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

function Corner({
  className, t, r, b, l,
}: {
  className: string; t: boolean; r: boolean; b: boolean; l: boolean;
}) {
  return (
    <div className={`absolute w-8 h-8 ${className}`}>
      {t && l && <div className="absolute top-0 left-0 w-full h-[2px] bg-white/75 rounded-full" />}
      {t && r && <div className="absolute top-0 right-0 w-full h-[2px] bg-white/75 rounded-full" />}
      {b && l && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/75 rounded-full" />}
      {b && r && <div className="absolute bottom-0 right-0 w-full h-[2px] bg-white/75 rounded-full" />}
      {t && l && <div className="absolute top-0 left-0 w-[2px] h-full bg-white/75 rounded-full" />}
      {t && r && <div className="absolute top-0 right-0 w-[2px] h-full bg-white/75 rounded-full" />}
      {b && l && <div className="absolute bottom-0 left-0 w-[2px] h-full bg-white/75 rounded-full" />}
      {b && r && <div className="absolute bottom-0 right-0 w-[2px] h-full bg-white/75 rounded-full" />}
    </div>
  );
}
