import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Settings,
  Activity,
  LogIn,
  LogOut,
  Zap,
  Layers,
  ChevronRight,
  Loader2,
  ServerCog,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "Scene Change" | "Object Entered" | "Object Left" | "Motion Spike";

interface SimilarityPoint {
  time: number;
  value: number;
}

interface ChangeEvent {
  id: string;
  time: number;
  score: number;
  type: EventType;
}

interface AnalysisResult {
  curve: SimilarityPoint[];
  events: ChangeEvent[];
  stats: {
    mean: number;
    std: number;
    min: number;
    max: number;
    sampleCount: number;
    eventCount: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eventColor(type: EventType): string {
  switch (type) {
    case "Scene Change":   return "#EF4444";
    case "Object Entered": return "#22C55E";
    case "Object Left":    return "#F59E0B";
    case "Motion Spike":   return "#8B5CF6";
  }
}

function eventIcon(type: EventType) {
  switch (type) {
    case "Scene Change":   return <Layers size={11} />;
    case "Object Entered": return <LogIn size={11} />;
    case "Object Left":    return <LogOut size={11} />;
    case "Motion Spike":   return <Zap size={11} />;
  }
}

function similarityLevel(v: number): { label: string; color: string } {
  if (v < 0.3) return { label: "Major Change", color: "#EF4444" };
  if (v < 0.7) return { label: "Moderate Change", color: "#F59E0B" };
  return { label: "Stable", color: "#22C55E" };
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "00:00.0";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

// ─── POST to backend ──────────────────────────────────────────────────────────

async function analyzeOnServer(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("video", file);

  const res = await fetch("/api/analyze", {
    method: "POST",
    body: formData,
  });
  
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

// ─── Similarity Graph ─────────────────────────────────────────────────────────

interface GraphProps {
  curve: SimilarityPoint[];
  playhead: number;
  duration: number;
  events: ChangeEvent[];
  onSeek: (t: number) => void;
}

function SimilarityGraph({ curve, playhead, duration, events, onSeek }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const VW = 1000; const VH = 88;
  const PL = 26; const PR = 6; const PT = 6; const PB = 20;
  const pW = VW - PL - PR; const pH = VH - PT - PB;

  const tX = useCallback((t: number) => PL + (t / Math.max(duration, 0.001)) * pW, [duration, pW]);
  const vY = useCallback((v: number) => PT + (1 - v) * pH, [pH]);

  const pathD = useMemo(() => {
    if (curve.length < 2) return "";
    return curve.map((p, i) => `${i === 0 ? "M" : "L"}${tX(p.time).toFixed(1)},${vY(p.value).toFixed(1)}`).join(" ");
  }, [curve, tX, vY]);

  const areaD = useMemo(() => {
    if (!pathD || curve.length < 2) return "";
    const z = vY(0);
    return `${pathD} L${tX(curve[curve.length - 1].time).toFixed(1)},${z} L${tX(0).toFixed(1)},${z} Z`;
  }, [pathD, curve, tX, vY]);

  const svgToTime = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width * VW - PL) / pW * duration));
  };

  const nearest = useCallback((t: number) =>
    curve.reduce((b, p) => Math.abs(p.time - t) < Math.abs(b.time - t) ? p : b, curve[0])
  , [curve]);

  const hoverPt = hoverT !== null ? nearest(hoverT) : null;
  const phX = tX(playhead);
  const phPt = curve.length ? nearest(playhead) : null;
  const phY = phPt ? vY(phPt.value) : vY(0);

  if (curve.length < 2) return null;

  return (
    <div className="relative w-full select-none" style={{ cursor: "crosshair" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height: 100 }}
        onMouseMove={(e) => setHoverT(svgToTime(e.clientX))}
        onMouseLeave={() => setHoverT(null)}
        onClick={(e) => { const t = svgToTime(e.clientX); if (t !== null) onSeek(t); }}
      >
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="pc"><rect x={PL} y={PT} width={pW} height={pH} /></clipPath>
        </defs>

        <line x1={PL} x2={PL + pW} y1={vY(0)} y2={vY(0)} stroke="#374151" strokeWidth={0.5} strokeDasharray="2 4" />
        <line x1={PL} x2={PL + pW} y1={vY(0.7)} y2={vY(0.7)} stroke="#22C55E" strokeWidth={0.35} strokeOpacity={0.3} strokeDasharray="1.5 4" />
        <line x1={PL} x2={PL + pW} y1={vY(0.3)} y2={vY(0.3)} stroke="#EF4444" strokeWidth={0.35} strokeOpacity={0.3} strokeDasharray="1.5 4" />

        <text x={PL - 3} y={PT + 2} textAnchor="end" fontSize={5} fill="#6B7280" dominantBaseline="middle">1</text>
        <text x={PL - 3} y={PT + pH} textAnchor="end" fontSize={5} fill="#6B7280" dominantBaseline="middle">0</text>

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <text key={i} x={tX(f * duration)} y={VH - 2} textAnchor="middle" fontSize={4.5} fill="#6B7280">
            {fmt(f * duration)}
          </text>
        ))}

        <path d={areaD} fill="url(#ag)" clipPath="url(#pc)" />
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" clipPath="url(#pc)" />
        <rect x={PL} y={PT} width={Math.max(0, phX - PL)} height={pH} fill="#3B82F6" fillOpacity={0.07} clipPath="url(#pc)" />

        {events.map((ev) => (
          <g key={ev.id}>
            <line x1={tX(ev.time)} x2={tX(ev.time)} y1={PT} y2={PT + pH}
              stroke={eventColor(ev.type)} strokeWidth={0.7} strokeOpacity={0.55} />
            <circle cx={tX(ev.time)} cy={vY(ev.score)} r={2.2}
              fill={eventColor(ev.type)} stroke="#0B0F19" strokeWidth={0.5} />
          </g>
        ))}

        {hoverT !== null && (
          <line x1={tX(hoverT)} x2={tX(hoverT)} y1={PT} y2={PT + pH}
            stroke="#FFFFFF" strokeWidth={0.5} strokeOpacity={0.2} />
        )}

        <line x1={phX} x2={phX} y1={PT} y2={PT + pH} stroke="#FFFFFF" strokeWidth={0.9} strokeOpacity={0.9} />
        <circle cx={phX} cy={phY} r={2.5} fill="#FFFFFF" stroke="#0B0F19" strokeWidth={0.8} />
      </svg>

      {hoverT !== null && hoverPt && (() => {
        const { label, color } = similarityLevel(hoverPt.value);
        const pct = tX(hoverT) / VW;
        return (
          <div
            className="absolute top-1 pointer-events-none z-20 px-2.5 py-1.5 rounded-lg text-xs border border-white/10"
            style={{
              left: pct < 0.75 ? `calc(${pct * 100}% + 8px)` : undefined,
              right: pct >= 0.75 ? `calc(${(1 - pct) * 100}% + 8px)` : undefined,
              backgroundColor: "rgba(17,24,39,0.96)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ color: "#9CA3AF", fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{fmt(hoverPt.time)}</div>
            <div className="font-semibold" style={{ color }}>{hoverPt.value.toFixed(4)}</div>
            <div style={{ color, fontSize: 10 }}>{label}</div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Timeline Bar ─────────────────────────────────────────────────────────────

function TimelineBar({
  playhead, duration, events, curve, onSeek,
}: {
  playhead: number; duration: number; events: ChangeEvent[];
  curve: SimilarityPoint[]; onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const frac = (e: MouseEvent | React.MouseEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    const f = frac(e);
    if (f !== null) onSeek(f * duration);
  };

  useEffect(() => {
    if (!dragging) return;
    const mv = (e: MouseEvent) => { const f = frac(e); if (f !== null) onSeek(f * duration); };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [dragging, duration, onSeek]);

  const playPct = duration > 0 ? (playhead / duration) * 100 : 0;

  const miniPath = useMemo(() => {
    if (curve.length < 2 || duration <= 0) return "";
    const W = 1000; const H = 32;
    return curve
      .map((p, i) => {
        const x = (p.time / duration) * W;
        const y = H / 2 + (1 - p.value) * (H / 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [curve, duration]);

  return (
    <div
      ref={barRef}
      className="relative h-8 rounded cursor-pointer select-none overflow-hidden"
      style={{ backgroundColor: "#161D2E" }}
      onMouseDown={handleMouseDown}
    >
      {miniPath && (
        <svg viewBox="0 0 1000 32" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          <path d={miniPath} fill="none" stroke="#3B82F6" strokeWidth={1.2} strokeOpacity={0.2} />
        </svg>
      )}
      <div className="absolute left-0 top-0 h-full" style={{ width: `${playPct}%`, backgroundColor: "#3B82F614" }} />

      {events.map((ev) => {
        const p = duration > 0 ? (ev.time / duration) * 100 : 0;
        const c = eventColor(ev.type);
        return (
          <div
            key={ev.id}
            className="absolute top-0 h-full group/m"
            style={{ left: `${p}%`, transform: "translateX(-50%)", zIndex: 10 }}
            onMouseDown={(e) => { e.stopPropagation(); onSeek(ev.time); }}
          >
            <div className="w-px h-full opacity-60 hover:opacity-100 transition-opacity" style={{ backgroundColor: c }} />
            <div className="absolute w-2 h-2 rounded-full border border-[#0B0F19]"
              style={{ backgroundColor: c, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
            <div className="absolute bottom-full mb-2 hidden group-hover/m:block pointer-events-none whitespace-nowrap z-30"
              style={{ left: "50%", transform: "translateX(-50%)" }}>
              <div className="px-2 py-1 rounded text-[10px] border border-white/10"
                style={{ backgroundColor: "rgba(17,24,39,0.96)", color: c }}>
                {ev.type} · {fmt(ev.time)}
              </div>
            </div>
          </div>
        );
      })}

      <div className="absolute top-0 h-full w-px bg-white pointer-events-none"
        style={{ left: `${playPct}%`, transform: "translateX(-50%)", zIndex: 20, boxShadow: "0 0 4px rgba(255,255,255,0.5)" }} />
      <div className="absolute w-3 h-3 rounded-full bg-white border-2 border-[#0B0F19] pointer-events-none"
        style={{ left: `${playPct}%`, top: "50%", transform: "translate(-50%,-50%)", zIndex: 21, boxShadow: "0 0 6px rgba(255,255,255,0.4)" }} />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "uploading" | "done" | "error";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  // ── Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setErrorMsg("");
    setPhase("idle");
    setSelectedFile(file);
  };

  // ── Run analysis
  const runAnalysis = useCallback(async () => {
    if (!selectedFile) return;

    setPhase("uploading");

    try {
      const analysis = await analyzeOnServer(selectedFile);
      setResult(analysis);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [selectedFile]);

  // Load video when file is selected
  useEffect(() => {
    if (selectedFile && videoRef.current) {
      const url = URL.createObjectURL(selectedFile);
      videoRef.current.src = url;
      
      const handleLoadedMetadata = () => {
        setDuration(videoRef.current?.duration || 0);
        runAnalysis();
      };
      
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      return () => {
        URL.revokeObjectURL(url);
        videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [selectedFile, runAnalysis]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
    setPlayhead(v.currentTime);
  }, [duration]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const replay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const curve  = result?.curve  ?? [];
  const events = result?.events ?? [];
  const stats  = result?.stats;

  const currentPt = useMemo(() => {
    if (!curve.length) return null;
    return curve.reduce((b, p) => Math.abs(p.time - playhead) < Math.abs(b.time - playhead) ? p : b, curve[0]);
  }, [curve, playhead]);

  const { label: lvlLabel, color: lvlColor } = currentPt
    ? similarityLevel(currentPt.value)
    : { label: "—", color: "#9CA3AF" };

  const phaseLabel =
    phase === "uploading" ? "Uploading video to server…" :
    phase === "done"      ? `Analysis complete · ${events.length} events detected` :
    phase === "error"     ? `Error: ${errorMsg}` : "";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#0B0F19", fontFamily: "'Inter', sans-serif", color: "#FFFFFF" }}
    >
      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav
        className="flex items-center gap-3 px-6 h-12 border-b shrink-0"
        style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#3B82F6,#8B5CF6)" }}>
          <Activity size={12} color="white" />
        </div>
        
        
        <span className="text-sm text-[#9CA3AF] truncate">Video Frame Similarity Analyzer</span>
        <div className="flex-1" />

        {/* Backend badge */}
       

        {phase === "uploading" && (
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            <Loader2 size={12} className="animate-spin" />
            {phaseLabel}
          </div>
        )}
        {phase === "done" && (
          <div className="flex items-center gap-1.5 text-xs text-[#22C55E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
            {phaseLabel}
          </div>
        )}
        {phase === "error" && (
          <div className="text-xs text-[#EF4444]">{phaseLabel}</div>
        )}

       
      </nav>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col max-w-[1200px] w-full mx-auto px-6 py-5 gap-0">

        {/* ── File Upload ─────────────────────────────────────────────────── */}
        {!selectedFile && (
          <div className="flex items-center justify-center p-8 border rounded-2xl mb-5"
            style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}>
            <div className="text-center">
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="text-sm text-[#9CA3AF]"
              />
              <p className="text-xs text-[#6B7280] mt-2">Select a video file to analyze</p>
            </div>
          </div>
        )}

        {/* ── Video Player  this is the frame─────────────────────────────────────────────────── */}
        {selectedFile && (
          <div className="rounded-t-2xl overflow-hidden border border-b-0"
            style={{ borderColor: "#1F2937", backgroundColor: "#000" }}>
            <div className="relative w-full bg-black" style={{ aspectRatio: "14/5" }}>
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                onTimeUpdate={() => { const v = videoRef.current; if (v) setPlayhead(v.currentTime); }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                playsInline
              />

              {/* Analysis overlay */}
              {phase === "uploading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
                  style={{ backgroundColor: "rgba(11,15,25,0.88)" }}>
                  <ServerCog size={36} color="#3B82F6" style={{ animation: "spin 2s linear infinite" }} />
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-sm font-semibold text-white">
                      Uploading video…
                    </div>
                    <div className="text-xs text-[#9CA3AF]">
                      FastAPI + OpenCV: processing video, computing SSIM
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 w-64">
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: "100%",
                          backgroundColor: "#3B82F6",
                          animation: "shimmer 1.5s infinite",
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      awaiting server response…
                    </div>
                  </div>
                </div>
              )}

              {/* HUD */}
              {phase === "done" && (
                <>
                  <div className="absolute top-3 left-4">
                    <div className="text-xs px-2.5 py-1 rounded flex items-center gap-2"
                      style={{ fontFamily: "'JetBrains Mono',monospace", backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}>
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: playing ? "#22C55E" : "#9CA3AF", boxShadow: playing ? "0 0 5px #22C55E" : "none" }} />
                      <span style={{ color: playing ? "#22C55E" : "#9CA3AF" }}>{playing ? "PLAYING" : "PAUSED"}</span>
                      <span className="text-white/60 ml-1">{fmt(playhead)}</span>
                    </div>
                  </div>
                  {currentPt && (
                    <div className="absolute top-3 right-4">
                      <div className="text-xs px-2.5 py-1 rounded"
                        style={{ fontFamily: "'JetBrains Mono',monospace", backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: lvlColor }}>
                        SSIM {currentPt.value.toFixed(3)} · {lvlLabel}
                      </div>
                    </div>
                  )}
                  {!playing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <button onClick={togglePlay}
                        className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ backgroundColor: "#3B82F6", boxShadow: "0 0 40px rgba(59,130,246,0.5)" }}>
                        <Play size={26} color="white" fill="white" style={{ marginLeft: 3 }} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 px-4 py-3 border-t"
              style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}>
              <button onClick={togglePlay} disabled={phase !== "done"}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10 active:scale-90 disabled:opacity-30">
                {playing ? <Pause size={16} color="#FFF" /> : <Play size={16} color="#FFF" fill="#FFF" />}
              </button>
              <button onClick={replay} disabled={phase !== "done"}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10 active:scale-90 disabled:opacity-30">
                <RotateCcw size={14} color="#9CA3AF" />
              </button>
              <button onClick={toggleMute}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10">
                {muted ? <VolumeX size={14} color="#9CA3AF" /> : <Volume2 size={14} color="#9CA3AF" />}
              </button>
              <span className="text-xs text-[#9CA3AF]" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                {fmt(playhead)} / {fmt(duration)}
              </span>
              <div className="flex-1" />
              {currentPt && phase === "done" && (
                <div className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-full transition-all duration-300"
                  style={{ backgroundColor: lvlColor + "18", color: lvlColor, border: `1px solid ${lvlColor}35` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lvlColor }} />
                  {lvlLabel}
                </div>
              )}
              <button className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10">
                <Maximize2 size={14} color="#9CA3AF" />
              </button>
            </div>
          </div>
        )}

        {/* ── Similarity Graph ──────────────────────────────────────────────── */}
        {selectedFile && (
          <div className="border border-b-0" style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/80">Frame Similarity (SSIM)</span>
                {phase === "done" && stats && (
                  <span className="text-[10px] text-[#6B7280]">
                    · {stats.sampleCount} samples · μ={stats.mean.toFixed(3)} · σ={stats.std.toFixed(3)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[#6B7280]">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3" style={{ height: 1, backgroundColor: "#EF4444", opacity: 0.5 }} />
                  0.3 threshold
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3" style={{ height: 1.5, backgroundColor: "#3B82F6" }} />
                  SSIM (OpenCV)
                </span>
              </div>
            </div>
            <div className="px-4 pb-2">
              {phase === "done" ? (
                <SimilarityGraph curve={curve} playhead={playhead} duration={duration} events={events} onSeek={seek} />
              ) : (
                <div className="flex items-center justify-center text-xs text-[#6B7280]" style={{ height: 100 }}>
                  {phase === "idle" ? "Select a video file…" :
                   phase === "uploading" ? <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Server computing similarity…</span> :
                   `Error — ${errorMsg}`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        {selectedFile && (
          <div className="border border-b-0 px-4 pt-3 pb-8"
            style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] text-[#6B7280] font-medium uppercase tracking-wider">Playback Timeline</span>
              <div className="flex items-center gap-3 flex-wrap">
                {(["Scene Change", "Object Entered", "Object Left", "Motion Spike"] as EventType[]).map((t) => (
                  <span key={t} className="flex items-center gap-1 text-[10px]" style={{ color: eventColor(t) }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: eventColor(t) }} />{t}
                  </span>
                ))}
              </div>
            </div>
            <TimelineBar playhead={playhead} duration={duration} events={events} curve={curve} onSeek={seek} />
            <div className="flex justify-between mt-6">
              <span className="text-[10px] text-[#4B5563]">{fmt(0)}</span>
              <span className="text-[10px] text-[#4B5563]">{fmt(duration / 2)}</span>
              <span className="text-[10px] text-[#4B5563]">{fmt(duration)}</span>
            </div>
          </div>
        )}

        {/* ── Events Table ──────────────────────────────────────────────────── */}
        {selectedFile && (
          <div className="rounded-b-2xl border overflow-hidden" style={{ borderColor: "#1F2937", backgroundColor: "#0D1117" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#1F2937" }}>
              <div className="flex items-center gap-2">
                <Activity size={13} color="#3B82F6" />
                <span className="text-sm font-semibold">Detected Events</span>
                {events.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: "#3B82F618", color: "#3B82F6", border: "1px solid #3B82F630" }}>
                    {events.length}
                  </span>
                )}
              </div>
              <button className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-white transition-colors">
                Export <ChevronRight size={11} />
              </button>
            </div>

            <div className="grid px-4 py-2 text-[10px] font-medium uppercase tracking-wider"
              style={{ gridTemplateColumns: "110px 150px 1fr", color: "#4B5563", borderBottom: "1px solid #1F2937" }}>
              <span>Timestamp</span><span>SSIM Score</span><span>Event Type</span>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 220, scrollbarWidth: "none" }}>
              {events.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-[#4B5563]">
                  {phase === "done" ? "No significant change events detected" : "Events will appear after analysis"}
                </div>
              )}
              {events.map((ev, i) => {
                const c = eventColor(ev.type);
                const isActive = Math.abs(ev.time - playhead) < 1.0;
                return (
                  <div key={ev.id}
                    className="grid px-4 py-2.5 cursor-pointer transition-colors duration-100 items-center"
                    style={{
                      gridTemplateColumns: "110px 150px 1fr",
                      backgroundColor: isActive ? c + "10" : i % 2 === 0 ? "transparent" : "#ffffff03",
                      borderLeft: `2px solid ${isActive ? c : "transparent"}`,
                    }}
                    onClick={() => seek(ev.time)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = c + "12")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isActive ? c + "10" : i % 2 === 0 ? "transparent" : "#ffffff03")}
                  >
                    <span className="text-xs font-medium" style={{ fontFamily: "'JetBrains Mono',monospace", color: "#9CA3AF" }}>
                      {fmt(ev.time)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-14 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${ev.score * 100}%`, backgroundColor: c }} />
                      </div>
                      <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono',monospace", color: c }}>
                        {ev.score.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: c }}>{eventIcon(ev.type)}</span>
                      <span className="text-xs" style={{ color: c }}>{ev.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
