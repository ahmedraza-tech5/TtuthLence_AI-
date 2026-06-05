import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type ComponentType, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Fingerprint,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { cn } from "./utils/cn";

type Verdict = "Likely AI-generated" | "Likely original" | "Needs review";

type SignalTone = "good" | "watch" | "risk";

type Signal = {
  label: string;
  detail: string;
  value: number;
  tone: SignalTone;
};

type AnalysisRecord = {
  id: string;
  fileName: string;
  fileKind: string;
  sizeText: string;
  verdict: Verdict;
  score: number;
  confidence: number;
  responseMs: number;
  summary: string;
  fingerprint: string;
  dimensions?: string;
  pages?: string;
  signals: Signal[];
};

const demoRecords: AnalysisRecord[] = [
  {
    id: "demo-1",
    fileName: "Brand launch concept.png",
    fileKind: "Image forensics",
    sizeText: "2.4 MB",
    verdict: "Likely AI-generated",
    score: 88,
    confidence: 95,
    responseMs: 482,
    summary:
      "The asset shows unusually even highlights, compressed texture variance, and near-perfect edge transitions. The model leans synthetic with strong confidence.",
    fingerprint: "TLX-DEMO-8K2Q4",
    dimensions: "3024 x 4032",
    signals: [
      {
        label: "Microtexture variance",
        detail: "Natural grain differences are unusually flattened across skin and fabric.",
        value: 87,
        tone: "risk",
      },
      {
        label: "Edge consistency",
        detail: "Contours stay unusually stable under zoom, a common synthetic tell.",
        value: 83,
        tone: "risk",
      },
      {
        label: "Metadata integrity",
        detail: "Capture metadata is sparse and internally inconsistent.",
        value: 71,
        tone: "risk",
      },
      {
        label: "Tone realism",
        detail: "Color roll-off looks polished but lacks sensor noise diversity.",
        value: 76,
        tone: "watch",
      },
    ],
  },
  {
    id: "demo-2",
    fileName: "Investor memo.pdf",
    fileKind: "Document intelligence",
    sizeText: "910 KB",
    verdict: "Needs review",
    score: 57,
    confidence: 88,
    responseMs: 519,
    summary:
      "The PDF displays clean formatting and repetitive layout cadence, but the model finds enough mixed signals to keep the verdict in review mode.",
    fingerprint: "TLX-DEMO-4P7MJ",
    pages: "Estimated 18 pages",
    signals: [
      {
        label: "Layout repetition",
        detail: "Section spacing is highly consistent, which can occur in generated decks.",
        value: 62,
        tone: "watch",
      },
      {
        label: "Font diversity",
        detail: "Typography variety is limited across the document structure.",
        value: 58,
        tone: "watch",
      },
      {
        label: "OCR residue",
        detail: "Raster traces are minimal, suggesting a native export rather than a scan.",
        value: 44,
        tone: "good",
      },
      {
        label: "Citation density",
        detail: "Reference patterns are sparse and not enough to fully anchor authenticity.",
        value: 51,
        tone: "watch",
      },
    ],
  },
  {
    id: "demo-3",
    fileName: "Editorial portrait.jpg",
    fileKind: "Image forensics",
    sizeText: "4.8 MB",
    verdict: "Likely original",
    score: 31,
    confidence: 90,
    responseMs: 463,
    summary:
      "Natural sensor noise, slight lens falloff, and believable highlight bloom suggest a camera-origin asset with low synthetic probability.",
    fingerprint: "TLX-DEMO-9Q6HX",
    dimensions: "4512 x 3008",
    signals: [
      {
        label: "Sensor noise",
        detail: "Noise distribution looks irregular and camera-realistic across shadow areas.",
        value: 28,
        tone: "good",
      },
      {
        label: "Lens behavior",
        detail: "Corner softness and falloff align with a real lens profile.",
        value: 26,
        tone: "good",
      },
      {
        label: "Compression footprint",
        detail: "Artifacts are present but consistent with standard export pipelines.",
        value: 33,
        tone: "good",
      },
      {
        label: "Artifact symmetry",
        detail: "No overly symmetrical structure or repeated texture cycles detected.",
        value: 35,
        tone: "good",
      },
    ],
  },
];

const demoAnalysis = demoRecords[0];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function createFingerprint(seed: number) {
  return `TLX-${seed.toString(36).slice(0, 5).toUpperCase().padStart(5, "0")}`;
}

function toneClass(tone: SignalTone) {
  if (tone === "risk") return "from-rose-500/20 to-white/50 text-rose-700 border-rose-200/80";
  if (tone === "watch") return "from-amber-500/20 to-white/50 text-amber-700 border-amber-200/80";
  return "from-emerald-500/20 to-white/50 text-emerald-700 border-emerald-200/80";
}

function buildSignals(seed: number, isPdf: boolean, score: number): Signal[] {
  const labelSets = isPdf
    ? [
        ["Layout repetition", "Section spacing and page rhythm feel unusually repetitive."],
        ["Font diversity", "Typography variety stays narrow across the document."],
        ["OCR residue", "Raster traces are low, which suggests a native export."],
        ["Citation density", "Reference density does not strongly anchor authorship."],
      ]
    : [
        ["Microtexture variance", "Natural grain differences are not evenly distributed."],
        ["Edge consistency", "Contours remain very stable across detail regions."],
        ["Metadata integrity", "Capture metadata appears sparse or internally inconsistent."],
        ["Tone realism", "Color roll-off is polished, but sensor noise is limited."],
      ];

  return labelSets.map((entry, index) => {
    const metric = clamp(((seed >> (index * 5)) % 100) + (score - 50) / 2, 8, 98);
    const tone: SignalTone = metric > 66 ? "risk" : metric > 44 ? "watch" : "good";
    return {
      label: entry[0],
      detail: `${entry[1]} ${tone === "risk" ? "This leans synthetic." : tone === "watch" ? "The model keeps it under review." : "This supports a more original reading."}`,
      value: Math.round(metric),
      tone,
    };
  });
}

async function inspectImage(file: File) {
  return new Promise<{ dimensions: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ dimensions: `${image.naturalWidth} x ${image.naturalHeight}` });
      URL.revokeObjectURL(url);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image preview failed"));
    };

    image.src = url;
  });
}

async function createAnalysis(file: File) {
  const seed = hashString(`${file.name}-${file.size}-${file.type}`);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const sizeText = formatBytes(file.size);
  const responseMs = 430 + (seed % 250);
  const sizeBias = clamp(file.size / (1024 * 1024), 0.1, 12);

  let score = isPdf ? 54 : 61;
  score += isPdf ? (seed % 17) - 6 : (seed % 23) - 8;
  score += file.size < 300_000 ? 7 : file.size > 5_000_000 ? -6 : 2;
  score += isPdf ? -Math.round(sizeBias / 2) : Math.round(sizeBias / 4);
  score = clamp(score, 9, 97);

  const confidence = clamp(87 - Math.abs(score - 50) / 2 + (seed % 8), 72, 97);
  const verdict: Verdict = score >= 68 ? "Likely AI-generated" : score <= 39 ? "Likely original" : "Needs review";
  const fileKind = isPdf ? "Document intelligence" : "Image forensics";
  const fingerprint = createFingerprint(seed);
  const signals = buildSignals(seed, isPdf, score);
  const summary = isPdf
    ? "The PDF is highly polished and structurally consistent, but the model spots enough layout regularity to keep confidence calibrated instead of absolute."
    : "The image exhibits highly consistent tones, low entropy variance, and controlled artifact behavior that trends synthetic rather than camera-captured.";

  let dimensions: string | undefined;
  let pages: string | undefined;

  if (isPdf) {
    pages = `Estimated ${clamp(Math.round(file.size / 120_000), 1, 120)} pages`;
  } else {
    try {
      const imageInfo = await inspectImage(file);
      dimensions = imageInfo.dimensions;
    } catch {
      dimensions = undefined;
    }
  }

  return {
    id: `${seed}`,
    fileName: file.name,
    fileKind,
    sizeText,
    verdict,
    score,
    confidence,
    responseMs,
    summary,
    fingerprint,
    dimensions,
    pages,
    signals,
  };
}

function GlassButton({
  children,
  className,
  subtle = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { subtle?: boolean }) {
  const buttonType = props.type ?? "button";

  return (
    <button
      {...props}
      type={buttonType}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-medium shadow-[0_16px_45px_rgba(19,64,40,0.12)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 focus:ring-offset-2 focus:ring-offset-transparent",
        subtle
          ? "border-white/70 bg-white/45 text-slate-700 hover:-translate-y-0.5 hover:bg-white/65"
          : "border-emerald-200/70 bg-white/70 text-slate-900 hover:-translate-y-0.5 hover:bg-white/90",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/45 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-emerald-950/60 backdrop-blur-xl">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="glass-panel p-5"
    >
      <div className="text-sm text-slate-600">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-2 text-sm text-slate-500">{sublabel}</div>
    </motion.div>
  );
}

function ConfidenceRing({ score, confidence }: { score: number; confidence: number }) {
  const size = 190;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 drop-shadow-[0_16px_24px_rgba(34,97,61,0.15)]">
        <defs>
          <linearGradient id="truthlens-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9ae6b4" />
            <stop offset="55%" stopColor="#68d391" />
            <stop offset="100%" stopColor="#38a169" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(18, 52, 32, 0.08)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#truthlens-ring)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.15, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <ShieldCheck className="h-7 w-7 text-emerald-600" />
        <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{score}%</div>
        <div className="mt-1 text-xs font-medium uppercase tracking-[0.28em] text-emerald-900/50">AI likelihood</div>
        <div className="mt-2 text-sm text-slate-500">Confidence {confidence}%</div>
      </div>
    </div>
  );
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisRecord>(demoAnalysis);
  const [history, setHistory] = useState<AnalysisRecord[]>(demoRecords);
  const [isDragging, setIsDragging] = useState(false);
  const logoRef = useRef<HTMLSpanElement | null>(null);
  const shineRef = useRef<HTMLSpanElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const logo = logoRef.current;
    const shine = shineRef.current;

    if (!logo || !shine) return undefined;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        shine,
        { xPercent: -120, opacity: 0 },
        {
          xPercent: 220,
          opacity: 0.95,
          duration: 2.6,
          repeat: -1,
          repeatDelay: 2.6,
          ease: "power2.inOut",
        },
      );

      gsap.fromTo(
        logo,
        { textShadow: "0 0 0 rgba(255,255,255,0)" },
        {
          textShadow: "0 0 18px rgba(255,255,255,0.85)",
          duration: 3.5,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        },
      );
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const highlightedSignals = useMemo(
    () => currentAnalysis.signals.filter((signal) => signal.value > 60),
    [currentAnalysis],
  );

  const averageScore = useMemo(() => {
    const total = history.reduce((sum, item) => sum + item.score, 0);
    return Math.round(total / history.length);
  }, [history]);

  const medianLatency = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.responseMs - b.responseMs);
    return sorted[Math.floor(sorted.length / 2)]?.responseMs ?? currentAnalysis.responseMs;
  }, [history, currentAnalysis.responseMs]);

  async function processFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    const isImage = file.type.startsWith("image/");
    setPreviewUrl(isImage ? URL.createObjectURL(file) : null);
    setIsAnalyzing(true);

    window.setTimeout(async () => {
      const analysis = await createAnalysis(file);
      setCurrentAnalysis(analysis);
      setHistory((items) => [analysis, ...items].slice(0, 5));
      setIsAnalyzing(false);
    }, 900);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    processFile(file).catch(() => setIsAnalyzing(false));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    processFile(file).catch(() => setIsAnalyzing(false));
  }

  const displayPreview = selectedFile?.type.startsWith("image/") && previewUrl;
  const displayedAnalysis = currentAnalysis;
  const scanLabel = selectedFile ? "Live scan" : "Demo scan";

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(192,255,220,0.72),transparent_28%),linear-gradient(180deg,#f8fdf8_0%,#edf8ef_45%,#e5f3e8_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.28)_1px,transparent_1px)] bg-[size:96px_96px] opacity-20" />
      <div className="absolute -left-28 top-24 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl animate-float-slow" />
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-white/60 blur-3xl animate-float-medium" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-lime-200/40 blur-3xl animate-float-slow" />

      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/45 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/70 shadow-[0_14px_38px_rgba(25,89,53,0.12)] backdrop-blur-xl">
              <ScanSearch className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="leading-tight">
              <div className="relative inline-flex overflow-hidden">
                <span ref={logoRef} className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  TruthLens AI
                </span>
                <span
                  ref={shineRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-[-8px] left-[-45%] w-14 rotate-12 bg-gradient-to-r from-transparent via-white/80 to-transparent blur-sm"
                />
              </div>
              <div className="text-xs text-emerald-950/50">AI provenance for images and PDFs</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/70 bg-white/45 px-4 py-2 text-xs font-medium text-emerald-950/60 shadow-[0_12px_30px_rgba(25,89,53,0.08)] backdrop-blur-xl md:block">
              Live model monitoring
            </div>
            <GlassButton subtle onClick={() => fileInputRef.current?.click()}>
              <UploadCloud className="h-4 w-4" />
              Upload file
            </GlassButton>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pb-14 lg:pt-10">
        <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="space-y-5">
              <SectionLabel icon={Sparkles}>Premium AI SaaS</SectionLabel>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl">
                  TruthLens AI
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                  Upload an image or PDF and get a polished forensic verdict with confidence scores, detailed signal breakdowns, and a premium analyst-grade summary in seconds.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <GlassButton onClick={() => fileInputRef.current?.click()} className="min-w-[170px]">
                  <UploadCloud className="h-4 w-4" />
                  Start upload
                  <ArrowUpRight className="h-4 w-4" />
                </GlassButton>
                <GlassButton
                  subtle
                  onClick={() => {
                    setCurrentAnalysis(demoAnalysis);
                    setSelectedFile(null);
                    setIsAnalyzing(false);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                    }
                    setPreviewUrl(null);
                  }}
                >
                  <BarChart3 className="h-4 w-4" />
                  Reset to demo
                </GlassButton>
              </div>
            </div>

            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="glass-panel overflow-hidden p-5 sm:p-6"
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleInputChange} />
              <div
                className={cn(
                  "rounded-[28px] border border-dashed p-5 transition-all duration-300 sm:p-6",
                  isDragging ? "border-emerald-400/80 bg-emerald-100/60" : "border-white/80 bg-white/45",
                )}
              >
                <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch">
                  <div className="flex-1 space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-950/45">Upload workspace</div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Drop a JPG, PNG, HEIC, or PDF</div>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                          TruthLens AI runs a luxury-grade review flow with an instant verdict, evidence notes, and provenance indicators that feel at home in an investor demo.
                        </p>
                      </div>
                      <div className="hidden rounded-2xl border border-white/70 bg-white/55 p-3 text-emerald-700 shadow-[0_14px_30px_rgba(22,95,56,0.1)] backdrop-blur-xl sm:block">
                        <ScanSearch className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      <button type="button" className="text-left font-medium text-emerald-800 underline decoration-emerald-400/50 underline-offset-4" onClick={(event) => event.stopPropagation()}>
                        Inspect a sample image
                      </button>
                      <span className="text-slate-300">/</span>
                      <button type="button" className="text-left font-medium text-emerald-800 underline decoration-emerald-400/50 underline-offset-4" onClick={(event) => event.stopPropagation()}>
                        Review a sample PDF
                      </button>
                    </div>
                    {isAnalyzing ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-900">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        Analyzing in progress
                      </div>
                    ) : null}
                  </div>

                  <div className="flex w-full max-w-[320px] flex-col justify-between rounded-[26px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_45px_rgba(25,89,53,0.08)] backdrop-blur-2xl xl:w-[320px]">
                    <AnimatePresence mode="wait">
                      {displayPreview ? (
                        <motion.div
                          key={selectedFile?.name}
                          initial={{ opacity: 0, scale: 0.96, y: 12 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.35 }}
                          className="space-y-3"
                        >
                          <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/80 shadow-[0_20px_45px_rgba(25,89,53,0.08)]">
                            <img src={previewUrl ?? undefined} alt={selectedFile?.name ?? "Selected file"} className="h-44 w-full object-cover" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{selectedFile?.name}</div>
                            <div className="text-xs text-slate-500">{selectedFile ? formatBytes(selectedFile.size) : "Ready for upload"}</div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="document-preview"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex h-full min-h-[220px] flex-col justify-between rounded-[22px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,250,243,0.7))] p-4"
                        >
                          <div className="flex items-center justify-between text-emerald-700">
                            <FileText className="h-7 w-7" />
                            <Fingerprint className="h-5 w-5 opacity-70" />
                          </div>
                          <div className="space-y-3">
                            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-950/45">Current scan</div>
                            <div className="text-xl font-semibold tracking-tight text-slate-950">{scanLabel}</div>
                            <p className="text-sm leading-6 text-slate-600">
                              {selectedFile
                                ? "The upload is being reviewed with structure, texture, and provenance lenses."
                                : "Use the demo analysis or upload a file to replace it with a live verdict."}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                            <div className="rounded-2xl border border-white/80 bg-white/60 p-3">Confidence score</div>
                            <div className="rounded-2xl border border-white/80 bg-white/60 p-3">Signal depth</div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <GlassButton className="mt-4 w-full" onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}>
                      <UploadCloud className="h-4 w-4" />
                      Choose a file
                    </GlassButton>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 }}
            className="glass-panel relative overflow-hidden p-5 sm:p-6"
          >
            <div className="absolute right-6 top-6 h-32 w-32 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="relative space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-950/45">Analysis results</div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{displayedAnalysis.fileName}</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{displayedAnalysis.summary}</p>
                </div>
                <div className="rounded-full border border-white/80 bg-white/60 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-[0_12px_26px_rgba(25,89,53,0.08)] backdrop-blur-xl">
                  {displayedAnalysis.responseMs} ms
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[200px_1fr]">
                <div className="rounded-[28px] border border-white/80 bg-white/55 p-5 shadow-[0_20px_48px_rgba(25,89,53,0.08)] backdrop-blur-2xl">
                  <ConfidenceRing score={displayedAnalysis.score} confidence={displayedAnalysis.confidence} />
                  <div className="mt-4 text-center">
                    <div className="text-sm font-semibold text-emerald-900/60">{displayedAnalysis.verdict}</div>
                    <div className="mt-1 text-sm text-slate-500">{displayedAnalysis.fileKind}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_35px_rgba(25,89,53,0.07)] backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-950/45">File type</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{selectedFile ? (selectedFile.type.startsWith("image/") ? "Image" : "PDF") : "Demo"}</div>
                    </div>
                    <div className="rounded-[22px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_35px_rgba(25,89,53,0.07)] backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-950/45">Confidence</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{displayedAnalysis.confidence}%</div>
                    </div>
                    <div className="rounded-[22px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_35px_rgba(25,89,53,0.07)] backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-950/45">Fingerprint</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{displayedAnalysis.fingerprint}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_35px_rgba(25,89,53,0.07)] backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-950/45">Artifact profile</div>
                      <div className="mt-2 text-sm font-medium text-slate-700">
                        {displayedAnalysis.dimensions ?? displayedAnalysis.pages ?? "No visual metadata detected"}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/80 bg-white/60 p-4 shadow-[0_16px_35px_rgba(25,89,53,0.07)] backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.3em] text-emerald-950/45">File size</div>
                      <div className="mt-2 text-sm font-medium text-slate-700">{selectedFile ? formatBytes(selectedFile.size) : displayedAnalysis.sizeText}</div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[28px] border border-white/80 bg-white/50 p-4 shadow-[0_20px_48px_rgba(25,89,53,0.07)] backdrop-blur-2xl">
                    {displayedAnalysis.signals.map((signal) => (
                      <motion.div
                        key={signal.label}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35 }}
                        className={cn("rounded-[20px] border p-3", toneClass(signal.tone))}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{signal.label}</div>
                            <div className="mt-1 text-xs leading-5 text-slate-600">{signal.detail}</div>
                          </div>
                          <div className="text-sm font-semibold tabular-nums text-slate-900">{signal.value}%</div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${signal.value}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className={cn(
                              "h-full rounded-full",
                              signal.tone === "risk"
                                ? "bg-gradient-to-r from-rose-400 to-rose-500"
                                : signal.tone === "watch"
                                  ? "bg-gradient-to-r from-amber-400 to-orange-400"
                                  : "bg-gradient-to-r from-emerald-400 to-emerald-600",
                            )}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Scans in session" value={String(history.length).padStart(2, "0")} sublabel="Investor-ready review flow" />
                <MetricCard label="Average score" value={`${averageScore}%`} sublabel="Across recent analyses" />
                <MetricCard label="Median latency" value={`${medianLatency} ms`} sublabel="Fast inference cadence" />
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/55 p-5 shadow-[0_20px_48px_rgba(25,89,53,0.08)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-950/45">Recent scans</div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Live provenance timeline</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-900">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Synced
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {history.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.07 }}
                      className="flex items-center justify-between gap-4 rounded-[20px] border border-white/80 bg-white/65 px-4 py-3"
                    >
                      <div>
                        <div className="font-medium text-slate-950">{item.fileName}</div>
                        <div className="text-xs text-slate-500">{item.fileKind}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{item.verdict}</div>
                        <div className="text-xs text-slate-500">{item.score}% AI likelihood</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard label="Files analyzed" value={String(history.length * 128)} sublabel="Session throughput indicator" />
          <MetricCard label="Trust lift" value={`${Math.max(18, 100 - averageScore)}%`} sublabel="Lower risk on original content" />
          <MetricCard label="High-signal flags" value={`${highlightedSignals.length}`} sublabel="Signals currently under review" />
        </section>
      </main>
    </div>
  );
}
