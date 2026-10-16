"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Dices,
  Grip,
  LoaderCircle,
  MapPin,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { modelDisplayName } from "../../lib/model-display-name";
import FloorWallEditor from './floor-wall-editor';
import { fitFloorPoint, parseFloorDraft, type FloorHold, type FloorPlacement } from './floor-wall-data';
import { WALL_ID, getFace, workingArea } from '../../../../../packages/config/tianyu-floor-wall';
import { TianyuRouteEditor } from "./tianyu-route-editor";
import { pickTianyuPhotoTarget } from "./tianyu-interaction";
import { addRoutePoint, newTianyuRoute, routeFromCandidate, type TianyuRouteEditorState } from "./tianyu-route";
import {
  attachTianyuRegistration,
  mergeTianyuReview,
  normalizeTianyuHolds,
  tianyuAssetDescription,
  tianyuBackupStorageKey,
  tianyuBoardStorageKey,
  tianyuReviewRevision,
  type StoredTianyuBoard,
  type TianyuHold,
  type TianyuSeedPayload,
  type TianyuRegistrationReport,
} from "./tianyu-board";
import { TianyuRegistrationInspector, TianyuRegistrationSummary } from "./tianyu-registration-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Hold = FloorHold;

type HoldPayload = {
  meta: {
    count: number;
    excludedSets: number;
    excludedIncomplete: number;
    byMaterial: Record<string, number>;
  };
  holds: Hold[];
};

type PlacementRole = "manual" | "start" | "move" | "foot" | "finish";
type StartLimb = "LH" | "RH" | "LF" | "RF";
type RouteMode = "free" | "fixed" | "tianyu";

type Placement = FloorPlacement;

type Candidate = {
  sourceModel?: RouteModel;
  sourcePrompt?: string;
  generationSource?: 'ai' | 'local-fallback';
  id: string;
  mode: RouteMode;
  title: string;
  subtitle: string;
  grade: string;
  accent: string;
  reach: string;
  focus: string;
  metrics: CandidateMetrics;
  placements: Placement[];
};

type CandidateMetrics = {
  totalCount: number;
  handCount: number;
  footCount: number;
  moveCount: number;
  maxSpanCm: number;
  maxMoveCm: number;
  supportedMoveRatio: number;
  estimatedGrade: number;
  gradeRange?: [number, number];
  gradeConfidence?: "low" | "medium";
  gradeDeviation?: number;
  startHoldCount?: number;
  startHandCount?: number;
  startFootCount?: number;
  score: number;
  passed: boolean;
  checks: {
    countRule: boolean;
    uniqueAssets: boolean;
    requiredRoles: boolean;
    startFinish: boolean;
    handReach: boolean;
    footSupport: boolean;
    spacing: boolean;
    startStance?: boolean;
    gradeFit?: boolean;
  };
  beta: Array<{
    targetInstanceId?: string;
    step: number;
    hand: "left" | "right";
    moveCm: number;
    handSpanCm: number;
    supported: boolean;
    technique: string;
  }>;
  issues: string[];
};

type RouteConstraints = {
  grade: number;
  targetActions: number;
  actionCountExplicit: boolean;
  pointCountMode: "auto" | "exact" | "max" | "min" | "range" | "around";
  targetTotalHolds: number;
  minTotalHolds: number;
  maxTotalHolds: number;
  maxTotalHoldsExplicit: boolean;
  style: string;
  traverse: boolean;
  farFinish: boolean;
  wallAngleDegrees?: number;
};

type RouteModel =
  | "claude-opus-5"
  | "claude-fable-5"
  | "gpt-5.5"
  | "gpt-5.6-sol"
  | "gpt-6-astra";

type AiCandidateResponse = {
  model: RouteModel;
  source?: "ai" | "local-fallback";
  notice?: string;
  constraints?: RouteConstraints;
  warnings?: string[];
  candidates: Array<{
    title: string;
    subtitle: string;
    grade: string;
    reach: string;
    focus: string;
    metrics: CandidateMetrics;
    placements: Array<{
      holdId: string;
      instanceId?: string;
      surfaceId?: string;
      x: number;
      y: number;
      rotation: number;
      scale: number;
      role: Exclude<PlacementRole, "manual">;
      roles?: PlacementRole[];
      startLimbs?: StartLimb[];
      step: number;
      hand?: "left" | "right" | "both";
      technique?: string;
    }>;
  }>;
  error?: string;
};

type ModeSession = {
  candidates: Candidate[];
  generationError: string | null;
  generationNotice: string | null;
  parsedConstraints: RouteConstraints | null;
  constraintWarnings: string[];
  activeCandidateId: string | null;
  manualReviewRequired: boolean;
};

type StoredFixedBoard = {
  version: 1;
  savedAt: string;
  placements: Array<{
    instanceId: string;
    holdId: string;
    x: number;
    y: number;
    rotation: number;
    scale: number;
  }>;
};

type Point2D = { x: number; y: number };

type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: ModelTool,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const sizePixels: Record<string, number> = {
  XS: 30,
  S: 38,
  M: 48,
  L: 60,
  XL: 74,
  XXL: 90,
  XXXL: 108,
};

const materialFilters = ["全部", "PU", "ABS", "木质", "玻璃钢"];
const candidateAccents = ["#ff5a36", "#2f84ff", "#d953c9"];
const fixedBoardStorageKey = "ai-gym.fixed-board.v1";
const tianyuSeedUrl = "/data/tianyu-reviewed-holds.json";
const tianyuRegistrationUrl = "/data/tianyu-registration-r1.json";
const randomFixedBoardHoldCount = 28;
const tianyuAngles = Array.from({ length: 13 }, (_, index) => index * 5);
const tianyuGripOptions = ["综合", "把手", "开放点", "捏点", "边缘点", "造型"];
const tianyuSizeOptions = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const tianyuPhotoQuad = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 100, y: 0 },
  bottomRight: { x: 100, y: 100 },
  bottomLeft: { x: 0, y: 100 },
};
const routeModels: Array<{ id: RouteModel; label: string }> = [
  { id: "claude-opus-5", label: modelDisplayName("claude-opus-5") },
  { id: "claude-fable-5", label: modelDisplayName("claude-fable-5") },
  { id: "gpt-5.5", label: modelDisplayName("gpt-5.5") },
  { id: "gpt-5.6-sol", label: modelDisplayName("gpt-5.6-sol") },
  { id: "gpt-6-astra", label: modelDisplayName("gpt-6-astra") },
];

function generationProgress(seconds: number, mode: RouteMode) {
  if (seconds < 8) {
    return { label: "编译定线要求", detail: "识别难度、点数规则与动作风格", value: 8 + seconds * 2 };
  }
  if (seconds < 25) {
    return { label: "规划左右手动作", detail: "生成三种不同的 Beta 与重心转换", value: 24 + (seconds - 8) * 1.2 };
  }
  if (seconds < 50) {
    return { label: "求解人体几何", detail: "检查手部可达、双手跨度与脚点支撑", value: 44 + (seconds - 25) * 0.8 };
  }
  if (seconds < 80) {
    return mode !== "free"
      ? { label: "在固定板上搜索线路", detail: "只从已安装点中选择并校验 Beta", value: 64 + (seconds - 50) * 0.45 }
      : { label: "匹配真实岩点并评分", detail: "使用独立库存匹配点位并执行硬校验", value: 64 + (seconds - 50) * 0.45 };
  }
  return {
    label: "模型仍在完善方案",
    detail: "复杂线路可能更慢；临时过载会自动重试",
    value: Math.min(94, 78 + (seconds - 80) * 0.12),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number) {
  return clamp(Math.round(value / 5) * 5, 5, 95);
}

function visualRole(placement: Placement) {
  if (placement.startLimbs?.length || placement.role === "start" || placement.roles?.includes("start")) return "start";
  if (placement.roles?.includes("finish")) return "finish";
  return placement.role;
}

function routePointDescription(placement: Placement) {
  const limbNames: Record<StartLimb, string> = { LH: "左手", RH: "右手", LF: "左脚", RF: "右脚" };
  const start = placement.startLimbs?.length ? `起步 ${placement.startLimbs.map((limb) => limbNames[limb]).join(" / ")}` : "";
  const roleNames: Record<PlacementRole, string> = { manual: "人工点位", start: "起步", move: "手点", foot: "脚点", finish: "终点" };
  const roles = [...new Set([placement.role, ...(placement.roles ?? [])])].filter((role) => role !== "manual" && !(start && role === "start"));
  return [start, ...roles.map((role) => roleNames[role])].filter(Boolean).join(" · ") || "人工点位";
}

function uniqueRoutePoints(placements: Placement[]) {
  return [...new Map(placements.map((point) => [point.instanceId, point])).values()];
}

function gradeEstimateLabel(metrics: CandidateMetrics) {
  return metrics.gradeRange
    ? `粗估 V${metrics.estimatedGrade}（范围 V${metrics.gradeRange[0]}–V${metrics.gradeRange[1]}）`
    : "难度待校准";
}

function pointCountLabel(constraints: RouteConstraints, mode: RouteMode) {
  const noun = mode === "free" ? "总安装点" : "线路点";
  if (constraints.pointCountMode === "exact") return `${noun} = ${constraints.targetTotalHolds}`;
  if (constraints.pointCountMode === "max") return `${noun} ≤ ${constraints.maxTotalHolds}`;
  if (constraints.pointCountMode === "min") return `${noun} ≥ ${constraints.minTotalHolds}`;
  if (constraints.pointCountMode === "range") return `${noun} ${constraints.minTotalHolds}–${constraints.maxTotalHolds}`;
  if (constraints.pointCountMode === "around") return `${noun}约 ${constraints.targetTotalHolds}`;
  return "点数随动作需要 · 难度优先";
}

function emptyModeSession(): ModeSession {
  return {
    candidates: [],
    generationError: null,
    generationNotice: null,
    parsedConstraints: null,
    constraintWarnings: [],
    activeCandidateId: null,
    manualReviewRequired: false,
  };
}

function shuffled<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function randomFixedBoardPositions() {
  const xs = [10, 30, 50, 70, 90];
  const ys = [90, 74, 58, 42, 26, 10];
  const positions = ys.flatMap((y) => xs.map((x) => ({ x, y })));
  const removable = shuffled(positions
    .map((position, index) => ({ position, index }))
    .filter(({ position }) => position.y > 10 && position.y < 90))
    .slice(0, positions.length - randomFixedBoardHoldCount);
  const removedIndexes = new Set(removable.map(({ index }) => index));
  return shuffled(positions.filter((_, index) => !removedIndexes.has(index)));
}

function boardToPhoto(x: number, y: number): Point2D {
  const u = x / 100;
  const v = y / 100;
  const { topLeft, topRight, bottomRight, bottomLeft } = tianyuPhotoQuad;
  return {
    x: topLeft.x * (1 - u) * (1 - v)
      + topRight.x * u * (1 - v)
      + bottomRight.x * u * v
      + bottomLeft.x * (1 - u) * v,
    y: topLeft.y * (1 - u) * (1 - v)
      + topRight.y * u * (1 - v)
      + bottomRight.y * u * v
      + bottomLeft.y * (1 - u) * v,
  };
}

function photoToBoard(x: number, y: number): Point2D | null {
  const { topLeft, topRight, bottomRight, bottomLeft } = tianyuPhotoQuad;
  let u = clamp((x - topLeft.x) / Math.max(1, topRight.x - topLeft.x), 0, 1);
  let v = clamp((y - topLeft.y) / Math.max(1, bottomLeft.y - topLeft.y), 0, 1);

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const point = boardToPhoto(u * 100, v * 100);
    const errorX = x - point.x;
    const errorY = y - point.y;
    const du = {
      x: (topRight.x - topLeft.x) * (1 - v) + (bottomRight.x - bottomLeft.x) * v,
      y: (topRight.y - topLeft.y) * (1 - v) + (bottomRight.y - bottomLeft.y) * v,
    };
    const dv = {
      x: (bottomLeft.x - topLeft.x) * (1 - u) + (bottomRight.x - topRight.x) * u,
      y: (bottomLeft.y - topLeft.y) * (1 - u) + (bottomRight.y - topRight.y) * u,
    };
    const determinant = du.x * dv.y - du.y * dv.x;
    if (Math.abs(determinant) < 0.00001) break;
    u += (errorX * dv.y - errorY * dv.x) / determinant;
    v += (du.x * errorY - du.y * errorX) / determinant;
  }

  if (u < -0.015 || u > 1.015 || v < -0.015 || v > 1.015) return null;
  return {
    x: Math.round(clamp(u, 0, 1) * 1000) / 10,
    y: Math.round(clamp(v, 0, 1) * 1000) / 10,
  };
}

function tianyuHoldToAsset(point: TianyuHold): Hold {
  return {
    id: `tianyu-${point.id}`,
    serial: point.serial,
    brand: "天宇训练板",
    material: "现场固定板",
    productType: "已安装岩点",
    description: tianyuAssetDescription(point),
    grip: point.grip,
    size: point.size,
    sizeLabel: point.size,
    dimensions: "",
    price: 0,
    image: "",
  };
}

export default function RouteSettingPage({ workspace = "operations", storageScope = 'local' }: { workspace?: "operations" | "training-board"; storageScope?: string }) {
  const [payload, setPayload] = useState<HoldPayload | null>(null);
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState("全部");
  const [routeMode, setRouteMode] = useState<RouteMode>(workspace === "training-board" ? "tianyu" : "free");
  const [freePlacements, setFreePlacements] = useState<Placement[]>([]);
  const [floorFaceId, setFloorFaceId] = useState('F2');
  const [pendingFloorHold, setPendingFloorHold] = useState<Hold | null>(null);
  const [floorTool, setFloorTool] = useState<'library' | 'ai' | 'none'>('library');
  const [floorNotice, setFloorNotice] = useState('');
  const floorStorageKey = `climbing.floor-wall.${WALL_ID}.${storageScope}`;
  const [fixedBoardPlacements, setFixedBoardPlacements] = useState<Placement[]>([]);
  const [tianyuHolds, setTianyuHolds] = useState<TianyuHold[]>([]);
  const [tianyuRegistration, setTianyuRegistration] = useState<TianyuRegistrationReport | null>(null);
  const [tianyuImageMode, setTianyuImageMode] = useState<"photo" | "overlay" | "scan">("photo");
  const [tianyuOverlayOpacity, setTianyuOverlayOpacity] = useState(0.5);
  const [tianyuLoading, setTianyuLoading] = useState(true);
  const [tianyuAngle, setTianyuAngle] = useState(30);
  const [tianyuAnnotating, setTianyuAnnotating] = useState(false);
  const [selectedTianyuId, setSelectedTianyuId] = useState<string | null>(null);
  const [tianyuEditor, setTianyuEditor] = useState<TianyuRouteEditorState | null>(null);
  const [tianyuRouteBusy, setTianyuRouteBusy] = useState(false);
  const [boardMaintenanceOpen, setBoardMaintenanceOpen] = useState(false);
  const [activeTianyuTool, setActiveTianyuTool] = useState<'ai' | 'manual'>('ai');
  const [tianyuToolsCollapsed, setTianyuToolsCollapsed] = useState(false);
  const [showTianyuRouteMarks, setShowTianyuRouteMarks] = useState(true);
  const boardMaintenanceRef = useRef<HTMLDetailsElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRouteNumbers, setShowRouteNumbers] = useState(false);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<RouteMode, string>>({
    free: "V4，偏技术型，3 或 4 点起步，包含一次横移，动作连贯，避免无用点。",
    fixed: "V4，偏技术型，3 或 4 点起步，包含一次横移，动作连贯，避免无用点。",
    tianyu: "V4，偏技术型，3 或 4 点起步，包含一次横移，动作连贯，避免无用点。",
  });
  const [model, setModel] = useState<RouteModel>("claude-fable-5");
  const [modeSessions, setModeSessions] = useState<Record<RouteMode, ModeSession>>({
    free: emptyModeSession(),
    fixed: emptyModeSession(),
    tianyu: emptyModeSession(),
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingCandidate, setPendingCandidate] = useState<Candidate | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [randomBoardDialogOpen, setRandomBoardDialogOpen] = useState(false);
  const [restoreTianyuDialogOpen, setRestoreTianyuDialogOpen] = useState(false);
  const [fixedBoardDirty, setFixedBoardDirty] = useState(false);
  const [hasSavedFixedBoard, setHasSavedFixedBoard] = useState(false);
  const [fixedBoardSavedAt, setFixedBoardSavedAt] = useState<string | null>(null);
  const [boardStorageMessage, setBoardStorageMessage] = useState<string | null>(null);
  const [tianyuDirty, setTianyuDirty] = useState(false);
  const [hasSavedTianyuBoard, setHasSavedTianyuBoard] = useState(false);
  const [tianyuSavedAt, setTianyuSavedAt] = useState<string | null>(null);
  const [tianyuStorageMessage, setTianyuStorageMessage] = useState<string | null>(null);
  const [tianyuAutoSeed, setTianyuAutoSeed] = useState<TianyuHold[]>([]);
  const wallRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const tianyuDragRef = useRef<{
    id: string;
    pointerId: number;
  } | null>(null);

  const placements = useMemo(() => routeMode === "free"
    ? freePlacements
    : routeMode === "fixed"
      ? fixedBoardPlacements
      : [], [fixedBoardPlacements, freePlacements, routeMode]);
  const setPlacements = routeMode === "free" ? setFreePlacements : setFixedBoardPlacements;
  const currentPointCount = routeMode === "tianyu" ? tianyuHolds.length : placements.length;
  const prompt = prompts[routeMode];
  const session = modeSessions[routeMode];
  const {
    candidates,
    generationError,
    generationNotice,
    parsedConstraints,
    constraintWarnings,
    activeCandidateId,
    manualReviewRequired,
  } = session;

  const updateModeSession = useCallback((mode: RouteMode, patch: Partial<ModeSession>) => {
    setModeSessions((current) => ({
      ...current,
      [mode]: { ...current[mode], ...patch },
    }));
  }, []);

  const setPrompt = useCallback((value: string) => {
    setPrompts((current) => ({ ...current, [routeMode]: value }));
  }, [routeMode]);

  useEffect(() => {
    if (workspace !== "operations") return;
    fetch("/data/holds.json")
      .then((response) => {
        if (!response.ok) throw new Error("岩点数据加载失败");
        return response.json() as Promise<HoldPayload>;
      })
      .then((loadedPayload) => {
        setPayload(loadedPayload);
        let hasFreeDraft = false;
        try {
          const raw = localStorage.getItem(floorStorageKey);
          if (raw) { const draft = parseFloorDraft(raw, loadedPayload.holds); setFreePlacements(draft.placements); setFloorFaceId(draft.faceId); hasFreeDraft = true; setFloorNotice('已恢复本机保存的三维墙面草稿。'); }
        } catch { setFloorNotice('三维草稿无法读取，原始存储仍保留，可重新导入。'); }
        try {
          const raw = window.localStorage.getItem(fixedBoardStorageKey);
          if (!raw) return;
          const saved = JSON.parse(raw) as Partial<StoredFixedBoard>;
          if (saved.version !== 1 || !Array.isArray(saved.placements)) throw new Error("保存格式已过期");
          const holdById = new Map(loadedPayload.holds.map((hold) => [hold.id, hold]));
          const restored = saved.placements.flatMap((item, index) => {
            if (!item || typeof item !== "object") return [];
            const hold = holdById.get(item.holdId);
            if (!hold || ![item.x, item.y, item.rotation, item.scale].every(Number.isFinite)) return [];
            return [{
              instanceId: typeof item.instanceId === "string" && item.instanceId ? item.instanceId : `saved-${index}-${item.holdId}`,
              hold,
              x: clamp(item.x, 5, 95),
              y: clamp(item.y, 5, 95),
              rotation: item.rotation,
              scale: clamp(item.scale, 0.5, 1.5),
              role: "manual" as const,
              routeColor: "#ff5a36",
            } satisfies Placement];
          });
          if (restored.length === 0) throw new Error("保存的岩点已不在当前岩点库中");
          setFixedBoardPlacements(restored);
          if (!hasFreeDraft) setRouteMode("fixed");
          setHasSavedFixedBoard(true);
          setFixedBoardSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);
          setFixedBoardDirty(false);
          if (restored.length !== saved.placements.length) {
            setBoardStorageMessage(`已恢复 ${restored.length} 个岩点；有 ${saved.placements.length - restored.length} 个资产在当前岩点库中不存在。`);
          }
        } catch {
          setBoardStorageMessage("已保存的固定板无法读取，可重新生成后覆盖保存。");
        }
      })
      .catch(() => setPayload({ meta: { count: 0, excludedSets: 0, excludedIncomplete: 0, byMaterial: {} }, holds: [] }));
  }, [workspace, floorStorageKey]);

  useEffect(() => {
    if (workspace !== "training-board") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      let stored: StoredTianyuBoard | null = null;
      let savedRaw: string | null = null;
      try {
        savedRaw = window.localStorage.getItem(tianyuBoardStorageKey);
        if (savedRaw) {
          const saved = JSON.parse(savedRaw) as Partial<StoredTianyuBoard>;
          if (saved.version !== 2 || !Array.isArray(saved.holds)) throw new Error("保存格式已过期");
          const restored = normalizeTianyuHolds(saved.holds);
          const savedAngle = Number(saved.angle);
          const angle = Number.isFinite(savedAngle) && savedAngle >= 0 && savedAngle <= 60 && savedAngle % 5 === 0 ? savedAngle : 30;
          stored = { version: 2, holds: restored, angle, savedAt: saved.savedAt ?? "", reviewRevision: saved.reviewRevision };
          setTianyuHolds(restored);
          setTianyuAngle(angle);
          setHasSavedTianyuBoard(true);
          setTianyuSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);
          setTianyuDirty(false);
        }
      } catch {
        setTianyuStorageMessage("正在载入 GPT-6 复核版点位图。原存档将保留备份。");
      }

      void Promise.all([fetch(tianyuSeedUrl).then((response) => {
          if (!response.ok) throw new Error("复核数据加载失败");
          return response.json() as Promise<TianyuSeedPayload>;
        }), fetch(tianyuRegistrationUrl).then((response) => {
          if (!response.ok) throw new Error("配准资料加载失败");
          return response.json() as Promise<TianyuRegistrationReport>;
        }).then((report) => report.version === 1 && report.points && report.validation ? report : null).catch(() => null)])
        .then(([seed, registration]) => {
          if (cancelled) return;
          if (seed.version !== 2 || seed.reviewRevision !== tianyuReviewRevision || !Array.isArray(seed.holds)) throw new Error("复核版本不匹配");
          setTianyuRegistration(registration);
          const enrich = (points: TianyuHold[]) => registration ? attachTianyuRegistration(points, registration) : points;
          const normalized = enrich(normalizeTianyuHolds(seed.holds).map((hold) => ({ ...hold, confirmed: true })));
          if (normalized.length < 6 || normalized.length !== seed.holds.length) throw new Error("复核数据不完整");
          setTianyuAutoSeed(normalized);
          if (stored?.reviewRevision === tianyuReviewRevision) {
            setTianyuHolds(enrich(stored.holds));
            return;
          }
          const next = enrich(stored ? mergeTianyuReview(stored.holds, normalizeTianyuHolds(seed.legacyHolds), normalized) : normalized);
          const ready = next.length >= 6 && Math.max(...next.map((hold) => hold.y)) - Math.min(...next.map((hold) => hold.y)) >= 42;
          const readiness = ready ? "可直接定线" : "已保留你的点位删改，可补点或恢复复核版后定线";
          const savedAt = new Date().toISOString();
          setTianyuHolds(next);
          try {
            if (savedRaw && !window.localStorage.getItem(tianyuBackupStorageKey)) {
              window.localStorage.setItem(tianyuBackupStorageKey, savedRaw);
            }
            window.localStorage.setItem(tianyuBoardStorageKey, JSON.stringify({ version: 2, holds: next, angle: stored?.angle ?? 30, savedAt, reviewRevision: tianyuReviewRevision } satisfies StoredTianyuBoard));
            setHasSavedTianyuBoard(true);
            setTianyuSavedAt(savedAt);
            setTianyuDirty(false);
            setTianyuStorageMessage(`GPT-6 复核版已载入并保存，${next.length} 个点全部确认，${readiness}${stored ? "；已有人工调整已保留" : ""}。`);
          } catch {
            setTianyuDirty(true);
            setTianyuStorageMessage(`已载入 ${next.length} 个已确认点，${readiness}；浏览器未能保存，请稍后点击保存。`);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTianyuStorageMessage("GPT-6 复核版暂时无法读取，已保留当前点位，可刷新重试或继续手工修改。");
          }
        })
        .finally(() => { if (!cancelled) setTianyuLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspace]);

  useEffect(() => {
    if (!isGenerating) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const holds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (payload?.holds ?? []).filter((hold) => {
      const matchesMaterial = material === "全部" || hold.material === material;
      const matchesSearch =
        !normalized ||
        [hold.serial, hold.description, hold.grip, hold.material, hold.brand]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesMaterial && matchesSearch;
    });
  }, [payload, query, material]);

  const selectedPlacement = useMemo(
    () => placements.find((item) => item.instanceId === selectedId) ?? null,
    [placements, selectedId],
  );

  const selectedTianyuHold = useMemo(
    () => tianyuHolds.find((item) => item.id === selectedTianyuId) ?? null,
    [selectedTianyuId, tianyuHolds],
  );
  const confirmedTianyuHolds = useMemo(
    () => tianyuHolds.filter((item) => item.confirmed),
    [tianyuHolds],
  );
  const tianyuPendingCount = tianyuHolds.length - confirmedTianyuHolds.length;
  const displayedTianyuAngle = tianyuEditor?.document.board.angle ?? tianyuAngle;

  useEffect(() => {
    if (!tianyuEditor?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.href === window.location.href || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('当前线路有未保存的更改，确定离开吗？')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); };
  }, [tianyuEditor?.dirty]);

  const manualTianyuPlacements = useMemo<Placement[]>(() => {
    if (!tianyuEditor) return [];
    const { points, moves, board } = tianyuEditor.document;
    const holds = new Map(board.holds.map(point => [point.id, point]));
    return points.flatMap((point, index) => {
      const hold = holds.get(point.holdId);
      if (!hold) return [];
      const firstMove = moves.findIndex(move => move.holdId === point.holdId);
      const handStart = point.startLimbs.some(limb => limb === 'LH' || limb === 'RH');
      return [{ instanceId: hold.id, hold: tianyuHoldToAsset(hold), x: hold.x, y: hold.y, rotation: 0, scale: 1,
        role: handStart ? 'start' : point.roles.includes('finish') ? 'finish' : point.roles.includes('move') ? 'move' : 'foot',
        roles: point.roles, startLimbs: point.startLimbs, step: point.startLimbs.length ? 0 : firstMove >= 0 ? firstMove + 1 : index + 1,
        hand: firstMove >= 0 ? moves[firstMove].hand : handStart ? 'both' : undefined,
        routeColor: '#ff5a36' } satisfies Placement];
    });
  }, [tianyuEditor]);

  const activeBoardCandidate = useMemo(
    () => routeMode !== "free" ? candidates.find((item) => item.id === activeCandidateId) ?? null : null,
    [activeCandidateId, candidates, routeMode],
  );

  const activeDisplayCandidate = useMemo(
    () => candidates.find((item) => item.id === activeCandidateId) ?? null,
    [activeCandidateId, candidates],
  );
  const routeListPoints = useMemo(() => uniqueRoutePoints(routeMode === "free"
    ? freePlacements.filter((point) => point.role !== "manual")
    : routeMode === "tianyu" && tianyuEditor ? manualTianyuPlacements : activeBoardCandidate?.placements ?? [])
    .sort((a, b) => Number(visualRole(b) === "start") - Number(visualRole(a) === "start") || (a.step ?? 0) - (b.step ?? 0)),
  [activeBoardCandidate, freePlacements, routeMode, manualTianyuPlacements, tianyuEditor]);
  const routeNumberById = useMemo(() => new Map(routeListPoints.map((point, index) => [point.instanceId, index + 1])), [routeListPoints]);
  const focusedRouteId = hoveredRouteId ?? (routeMode === "tianyu" ? selectedTianyuId : selectedId);
  const focusedRoutePoint = routeListPoints.find((point) => point.instanceId === focusedRouteId);

  const activeFixedCandidate = routeMode === "fixed" ? activeBoardCandidate : null;
  const activeTianyuCandidate = routeMode === "tianyu" ? activeBoardCandidate : null;
  const tianyuRouteVisible = Boolean(tianyuEditor || activeTianyuCandidate);
  const activeTianyuRouteByInstance = useMemo(
    () => new Map((tianyuEditor ? manualTianyuPlacements : activeTianyuCandidate?.placements ?? []).map((placement) => [placement.instanceId, placement])),
    [activeTianyuCandidate, manualTianyuPlacements, tianyuEditor],
  );

  const displayPlacements = useMemo(() => {
    if (routeMode !== "fixed") return freePlacements;
    const routeByInstance = new Map(
      (activeFixedCandidate?.placements ?? []).map((placement) => [placement.instanceId, placement]),
    );
    return fixedBoardPlacements.map((base) => {
      const routePoint = routeByInstance.get(base.instanceId);
      if (!routePoint) {
        return {
          ...base,
          role: "manual" as const,
          roles: undefined,
          startLimbs: undefined,
          step: undefined,
          hand: undefined,
          technique: undefined,
          routeColor: "#ff5a36",
        };
      }
      return {
        ...base,
        role: routePoint.role,
        roles: routePoint.roles,
        startLimbs: routePoint.startLimbs,
        step: routePoint.step,
        hand: routePoint.hand,
        technique: routePoint.technique,
        routeColor: routePoint.routeColor,
      };
    });
  }, [activeFixedCandidate, fixedBoardPlacements, freePlacements, routeMode]);

  const activeModelLabel = routeModels.find((item) => item.id === model)?.label ?? model;
  const progress = generationProgress(elapsedSeconds, routeMode);
  const fixedBoardReady = fixedBoardPlacements.length >= 6;
  const tianyuVerticalCoverage = confirmedTianyuHolds.length === 0
    ? 0
    : Math.max(...confirmedTianyuHolds.map((point) => point.y)) - Math.min(...confirmedTianyuHolds.map((point) => point.y));
  const tianyuBoardReady = !tianyuLoading && confirmedTianyuHolds.length >= 6 && tianyuVerticalCoverage >= 42;
  const fixedBoardSavedLabel = fixedBoardDirty
    ? hasSavedFixedBoard ? "有未保存调整" : "尚未保存"
    : hasSavedFixedBoard
      ? `已保存${fixedBoardSavedAt ? ` · ${new Date(fixedBoardSavedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`
      : "尚未保存";
  const tianyuBoardSavedLabel = tianyuDirty
    ? hasSavedTianyuBoard ? "有未保存调整" : "尚未保存"
    : hasSavedTianyuBoard
      ? `已保存${tianyuSavedAt ? ` · ${new Date(tianyuSavedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`
      : "尚未保存";
  const promptExamples = routeMode !== "free"
    ? [
      { label: "V2 · 流畅入门", prompt: `V2 入门流畅，4 点起步，${routeMode === "tianyu" ? `${tianyuAngle}°仰角` : "直壁"}。` },
      { label: "V5 · 约 9 点", prompt: `V5 力量直上，3 点起步，线路用点约 9 个，${routeMode === "tianyu" ? `${tianyuAngle}°仰角` : "直壁"}。` },
      { label: "V6 · 技术横移", prompt: `V6 技术型，4 点起步，包含横移，避免无用点，${routeMode === "tianyu" ? `${tianyuAngle}°仰角` : "直壁"}。` },
    ]
    : [
      { label: "V2 · 流畅入门", prompt: "V2 入门流畅，4 点起步，适应当前墙段倾角。" },
      { label: "V5 · 约 9 点", prompt: "V5 力量直上，3 点起步，总安装点约 9 个。" },
      { label: "V6 · 技术横移", prompt: "V6 技术型，4 点起步，包含横移，避免无用点。" },
    ];

  const addToWall = useCallback((hold: Hold, x = 50, y = 50) => {
    if (routeMode === "tianyu") return;
    const instanceId = `${hold.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const next: Placement = {
      instanceId,
      hold,
      x: snap(x),
      y: snap(y),
      rotation: 0,
      scale: 1,
      role: "manual",
      routeColor: "#ff5a36",
    };
    if (routeMode === "free") setFreePlacements((current) => [...current, next]);
    else {
      setFixedBoardPlacements((current) => [...current, next]);
      setFixedBoardDirty(true);
    }
    setSelectedId(instanceId);
    updateModeSession(routeMode, {
      activeCandidateId: null,
      manualReviewRequired: true,
      ...(routeMode === "fixed" ? { candidates: [] } : {}),
    });
  }, [routeMode, updateModeSession]);

  const generateFromPrompt = useCallback(
    async (text = prompt) => {
      const requestMode = routeMode;
      if (requestMode === 'tianyu' && tianyuEditor) {
        updateModeSession('tianyu', { generationError: '请先保存并结束当前线路编辑，再生成新的 AI 候选。' });
        return [];
      }
      const catalog = requestMode === "tianyu"
        ? confirmedTianyuHolds.map(tianyuHoldToAsset)
        : payload?.holds ?? [];
      if (catalog.length === 0 || isGenerating) return [];
      const boardSnapshot = requestMode === "fixed"
        ? fixedBoardPlacements.map((placement) => ({ ...placement }))
        : requestMode === "tianyu"
          ? confirmedTianyuHolds.map((point) => ({
            instanceId: point.id,
            hold: tianyuHoldToAsset(point),
            x: point.x,
            y: point.y,
            rotation: 0,
            scale: 1,
            role: "manual" as const,
            routeColor: "#ff5a36",
          } satisfies Placement))
          : [];
      if (requestMode !== "free" && boardSnapshot.length < 6) {
        updateModeSession(requestMode, {
          generationError: requestMode === "tianyu"
            ? "请先确认至少 6 个岩点，并覆盖起步区、中段和顶部。"
            : "请先在固定板上安装至少 6 个岩点，并覆盖起步区到顶部。",
        });
        return [];
      }
      if (requestMode === "tianyu" && tianyuVerticalCoverage < 42) {
        updateModeSession(requestMode, {
          generationError: "当前已确认点的纵向覆盖不足 1.68 米；请确认或补充起步区和顶部岩点。",
        });
        return [];
      }
      setPrompt(text);
      setElapsedSeconds(0);
      setIsGenerating(true);
      updateModeSession(requestMode, {
        generationError: null,
        generationNotice: null,
        parsedConstraints: null,
        constraintWarnings: [],
      });

      try {
        const response = await fetch("/backend/route-setting/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: requestMode === "free" ? "free" : "fixed",
            prompt: text,
            model,
            holds: catalog.map(({ id, serial, grip, size, material, dimensions, productType, description }) => ({
              id,
              serial,
              grip,
              size,
              material,
              dimensions,
              productType,
              description,
            })),
            ...(requestMode !== "free" ? {
              boardPlacements: boardSnapshot.map((placement) => ({
                instanceId: placement.instanceId,
                holdId: placement.hold.id,
                x: placement.x,
                y: placement.y,
                rotation: placement.rotation,
              })),
            } : {}),
            ...(requestMode === "tianyu" ? { wallAngle: tianyuAngle } : {}),
            ...(requestMode === 'free' ? { wall: { id: WALL_ID, faceId: floorFaceId } } : {}),
          }),
        });
        const result = (await response.json()) as AiCandidateResponse;
        if (!response.ok) throw new Error(result.error || "AI 定线服务暂时不可用");

        const holdById = new Map(catalog.map((hold) => [hold.id, hold]));
        const boardByInstance = new Map(boardSnapshot.map((placement) => [placement.instanceId, placement]));
        const generationId = Date.now();
        const next = result.candidates.map((candidate, candidateIndex) => ({
          id: `ai-${requestMode}-${generationId}-${candidateIndex}`,
          sourceModel: result.model,
          sourcePrompt: text,
          generationSource: result.source ?? 'ai',
          mode: requestMode,
          title: candidate.title,
          subtitle: candidate.subtitle,
          grade: candidate.grade,
          accent: candidateAccents[candidateIndex] ?? candidateAccents[0],
          reach: candidate.reach,
          focus: candidate.focus,
          metrics: candidate.metrics,
          placements: candidate.placements.flatMap((placement, placementIndex) => {
            const boardPoint = requestMode !== "free" && placement.instanceId
              ? boardByInstance.get(placement.instanceId)
              : undefined;
            const hold = boardPoint?.hold ?? holdById.get(placement.holdId);
            if (!hold) return [];
            return [{
              instanceId: boardPoint?.instanceId ?? `ai-${generationId}-${candidateIndex}-${placementIndex}-${hold.id}`,
              hold,
              x: boardPoint?.x ?? (requestMode === 'free' ? placement.x : snap(placement.x)),
              y: boardPoint?.y ?? (requestMode === 'free' ? placement.y : snap(placement.y)),
              surfaceId: requestMode === 'free' ? placement.surfaceId ?? floorFaceId : undefined,
              rotation: boardPoint?.rotation ?? placement.rotation,
              scale: boardPoint?.scale ?? placement.scale,
              role: placement.role,
              roles: placement.roles,
              startLimbs: placement.startLimbs,
              step: placement.step,
              hand: placement.hand,
              technique: placement.technique,
              routeColor: candidateAccents[candidateIndex] ?? candidateAccents[0],
            } satisfies Placement];
          }),
        } satisfies Candidate));
        updateModeSession(requestMode, {
          candidates: next,
          activeCandidateId: null,
          ...(requestMode !== "free" ? { manualReviewRequired: false } : {}),
          generationNotice: result.notice ?? null,
          parsedConstraints: result.constraints ?? null,
          constraintWarnings: result.warnings ?? [],
        });
        return next;
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 定线失败，请稍后重试";
        updateModeSession(requestMode, {
          generationError: message,
          generationNotice: null,
          parsedConstraints: null,
          constraintWarnings: [],
        });
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    [confirmedTianyuHolds, fixedBoardPlacements, isGenerating, model, payload, prompt, routeMode, setPrompt, tianyuAngle, tianyuVerticalCoverage, updateModeSession, tianyuEditor, floorFaceId],
  );

  const applyCandidate = useCallback((candidate: Candidate) => {
    if (candidate.mode === 'tianyu' && tianyuRouteBusy) return;
    if (candidate.mode === 'tianyu') {
      if (tianyuEditor?.dirty && !window.confirm('当前线路有未保存的更改，确定放弃并采用此 AI 候选吗？')) return;
      setTianyuAnnotating(false);
      setActiveTianyuTool('manual');
      setTianyuToolsCollapsed(false);
      setTianyuEditor({ dirty: true, document: routeFromCandidate(tianyuHolds, tianyuAngle, tianyuReviewRevision, candidate, candidate.sourceModel ?? model, candidate.sourcePrompt ?? prompt, candidate.generationSource) });
    }
    if (candidate.mode === "free") { setFreePlacements(candidate.placements); setPendingFloorHold(null); const face = candidate.placements[0]?.surfaceId; if (face && getFace(face)?.kind === 'main') setFloorFaceId(face); }
    updateModeSession(candidate.mode, {
      activeCandidateId: candidate.id,
      manualReviewRequired: false,
    });
    setSelectedId(null);
    setSelectedTianyuId(null);
    setHoveredRouteId(null);
  }, [updateModeSession, tianyuEditor, tianyuHolds, tianyuAngle, model, prompt, tianyuRouteBusy]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async (tool: ModelTool) => {
      try {
        await context.registerTool(tool, { signal: lifecycle.signal });
      } catch {
        // WebMCP is optional in browsers that expose only a partial implementation.
      }
    };
    void register({
      name: "generate_route_candidates",
      title: "生成定线候选方案",
      description: "根据自然语言定线要求生成并显示三条候选路线，不会覆盖当前墙面。",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string", minLength: 3 } },
        required: ["prompt"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        const text = input.prompt;
        if (typeof text !== "string" || text.trim().length < 3) {
          throw new Error("prompt 必须是至少 3 个字符的字符串");
        }
        const next = await generateFromPrompt(text.trim());
        return {
          count: next.length,
          candidates: next.map((item) => ({ id: item.id, title: item.title, grade: item.grade })),
        };
      },
    });
    void register({
      name: "apply_route_candidate",
      title: "采用候选路线",
      description: routeMode !== "free"
        ? "在固定板上高亮指定候选路线，不移动或删除任何已安装岩点。"
        : "用指定候选路线替换当前墙面方案，并进入人工调整状态。",
      inputSchema: {
        type: "object",
        properties: { candidateId: { type: "string" } },
        required: ["candidateId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const candidate = candidates.find((item) => item.id === input.candidateId);
        if (!candidate) throw new Error("未找到这个候选方案");
        applyCandidate(candidate);
        return { candidateId: candidate.id, placements: candidate.placements.length };
      },
    });
    void register({
      name: "read_route_state",
      title: "读取当前定线状态",
      description: "读取当前墙面上的岩点数量和正在使用的候选方案。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return {
          mode: routeMode,
          placementCount: currentPointCount,
          activeCandidateId,
          selectedHold: routeMode === "tianyu"
            ? selectedTianyuHold?.serial ?? null
            : selectedPlacement?.hold.serial ?? null,
        };
      },
    });
    return () => lifecycle.abort();
  }, [activeCandidateId, applyCandidate, candidates, currentPointCount, generateFromPrompt, routeMode, selectedPlacement, selectedTianyuHold]);

  function openTianyuRoute(state: TianyuRouteEditorState) {
    if (tianyuEditor?.dirty && !window.confirm('当前线路有未保存更改，确定放弃并打开另一条线路吗？')) return;
    if (state.id && tianyuDirty && !window.confirm('当前板面有未保存更改。打开线路会载入它保存时的板面快照，但不覆盖本机已保存的板面。确定继续吗？')) return;
    if (state.id) {
      const holds = normalizeTianyuHolds(state.document.board.holds);
      setTianyuHolds(tianyuRegistration ? attachTianyuRegistration(holds, tianyuRegistration) : holds);
      setTianyuAngle(state.document.board.angle);
      setTianyuDirty(true);
      setTianyuStorageMessage('正在使用该线路保存时的板面快照；本机已保存的板面没有改变。');
    }
    setTianyuAnnotating(false);
    setActiveTianyuTool('manual');
    setTianyuToolsCollapsed(false);
    setSelectedTianyuId(null);
    setTianyuEditor(state);
    updateModeSession('tianyu', { activeCandidateId: null, manualReviewRequired: true, generationError: null });
  }

  function selectTianyuRoutePoint(point: TianyuHold) {
    if (tianyuRouteBusy) return;
    setSelectedTianyuId(point.id);
    if (tianyuEditor) setActiveTianyuTool('manual');
    setTianyuEditor(current => {
      if (!current) return current;
      const next = addRoutePoint(current.document, point.id);
      return next === current.document ? current : { ...current, dirty: true, document: next };
    });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (routeMode === "tianyu") return;
    const holdId = event.dataTransfer.getData("text/hold-id");
    const hold = payload?.holds.find((item) => item.id === holdId);
    const wall = wallRef.current;
    if (!hold || !wall) return;
    const rect = wall.getBoundingClientRect();
    addToWall(
      hold,
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
  }

  function updatePlacement(id: string, patch: Partial<Placement>) {
    if (routeMode === "tianyu") return;
    setPlacements((current) =>
      current.map((item) => (item.instanceId === id ? { ...item, ...patch } : item)),
    );
    updateModeSession(routeMode, {
      activeCandidateId: null,
      manualReviewRequired: true,
      ...(routeMode === "fixed" ? { candidates: [] } : {}),
    });
    if (routeMode === "fixed") setFixedBoardDirty(true);
  }

  function removePlacement(id: string) {
    if (routeMode === "tianyu") return;
    setPlacements((current) => current.filter((item) => item.instanceId !== id));
    setSelectedId(null);
    updateModeSession(routeMode, {
      activeCandidateId: null,
      manualReviewRequired: true,
      ...(routeMode === "fixed" ? { candidates: [] } : {}),
    });
    if (routeMode === "fixed") setFixedBoardDirty(true);
  }

  function placeFloorHold(holdId: string, hit: { surfaceId: string; x: number; y: number }) {
    const hold = payload?.holds.find(h => h.id === holdId); if (!hold) return;
    if (freePlacements.length >= 500) { setFloorNotice('当前草稿最多支持 500 个安装点，请先拆分作业。'); return; }
    try {
      const position = fitFloorPoint(hold,hit), instanceId = crypto.randomUUID();
      setFreePlacements(current => [...current, { instanceId, hold, ...position, rotation:0, scale:1, role:'manual', routeColor:'#ff5a36' }]);
      setSelectedId(instanceId); setPendingFloorHold(null); setFloorNotice('');
      updateModeSession('free',{ activeCandidateId:null, manualReviewRequired:true });
    } catch(error) { setFloorNotice(error instanceof Error ? error.message : '无法放置岩点'); }
  }

  function updateFloorHold(id: string, patch: Partial<Placement>) {
    const point = freePlacements.find(p => p.instanceId === id); if (!point) return;
    try {
      const next = {...point,...patch};
      const fitted = fitFloorPoint(next.hold,{surfaceId:next.surfaceId??'F2',x:next.x,y:next.y},next.scale);
      updatePlacement(id,{...patch,...fitted}); setFloorNotice('');
    } catch(error) { setFloorNotice(error instanceof Error ? error.message : '无法移动岩点'); }
  }

  function startMove(event: React.PointerEvent<HTMLButtonElement>, placement: Placement) {
    const wall = wallRef.current;
    if (!wall) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = wall.getBoundingClientRect();
    dragRef.current = {
      id: placement.instanceId,
      pointerId: event.pointerId,
      offsetX: ((event.clientX - rect.left) / rect.width) * 100 - placement.x,
      offsetY: ((event.clientY - rect.top) / rect.height) * 100 - placement.y,
    };
    setSelectedId(placement.instanceId);
  }

  function moveHold(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const wall = wallRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !wall) return;
    const rect = wall.getBoundingClientRect();
    updatePlacement(drag.id, {
      x: snap(((event.clientX - rect.left) / rect.width) * 100 - drag.offsetX),
      y: snap(((event.clientY - rect.top) / rect.height) * 100 - drag.offsetY),
    });
  }

  function finishMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function requestCandidate(candidate: Candidate) {
    if (candidate.mode !== "free") {
      applyCandidate(candidate);
      return;
    }
    if (placements.length === 0) {
      applyCandidate(candidate);
      return;
    }
    setPendingCandidate(candidate);
    setReplaceDialogOpen(true);
  }

  function clearRoute() {
    if (routeMode === 'tianyu' && (tianyuEditor || isGenerating)) return;
    if (routeMode === "tianyu" && tianyuLoading) return;
    if (routeMode === "tianyu") {
      setTianyuHolds([]);
      setSelectedTianyuId(null);
      setTianyuDirty(true);
      setTianyuStorageMessage(null);
      updateModeSession("tianyu", {
        candidates: [],
        activeCandidateId: null,
        manualReviewRequired: false,
        generationError: null,
        generationNotice: null,
        parsedConstraints: null,
        constraintWarnings: [],
      });
      return;
    }
    setPlacements([]);
    setSelectedId(null);
    updateModeSession(routeMode, {
      activeCandidateId: null,
      manualReviewRequired: false,
      ...(routeMode === "fixed" ? { candidates: [] } : {}),
    });
    if (routeMode === "fixed") setFixedBoardDirty(true);
  }

  function invalidateTianyuBoard() {
    setTianyuDirty(true);
    setTianyuStorageMessage(null);
    updateModeSession("tianyu", {
      candidates: [],
      activeCandidateId: null,
      manualReviewRequired: true,
      generationError: null,
      generationNotice: null,
      parsedConstraints: null,
      constraintWarnings: [],
    });
  }

  function addTianyuHold(point: Point2D) {
    if (tianyuLoading || tianyuEditor || isGenerating) return;
    const index = tianyuHolds.reduce((maximum, item) => {
      const value = Number(item.serial.match(/(\d+)$/)?.[1] ?? 0);
      return Math.max(maximum, value);
    }, 0) + 1;
    const id = `ty-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setTianyuHolds((current) => [...current, {
      id,
      serial: `TY-${String(index).padStart(3, "0")}`,
      x: point.x,
      y: point.y,
      radius: 1.7,
      grip: "综合",
      size: "M",
      source: "manual",
      confirmed: true,
      humanEdited: true,
    }]);
    setSelectedTianyuId(id);
    invalidateTianyuBoard();
  }

  function updateTianyuHold(id: string, patch: Partial<TianyuHold>) {
    if (tianyuLoading || tianyuEditor || isGenerating) return;
    setTianyuHolds((current) => current.map((item) => item.id === id ? { ...item, ...patch, humanEdited: true, confirmed: true } : item));
    invalidateTianyuBoard();
  }

  function confirmAllTianyuHolds() {
    if (tianyuPendingCount === 0) return;
    setTianyuHolds((current) => current.map((item) => ({ ...item, confirmed: true })));
    invalidateTianyuBoard();
    setTianyuStorageMessage(`已批量接受 ${tianyuPendingCount} 个初标点；仍建议抽查边缘、灰色点和大体量岩点。`);
  }

  function restoreTianyuAutoSeed() {
    if (tianyuAutoSeed.length === 0) return;
    setTianyuHolds(tianyuAutoSeed.map((item) => ({ ...item, confirmed: true })));
    setSelectedTianyuId(null);
    setRestoreTianyuDialogOpen(false);
    invalidateTianyuBoard();
    setTianyuStorageMessage(`已恢复 ${tianyuAutoSeed.length} 个 GPT-6 复核点，全部已确认，可直接定线；点击保存可保留此版本。`);
  }

  function removeTianyuHold(id: string) {
    if (tianyuLoading || tianyuEditor || isGenerating) return;
    setTianyuHolds((current) => current.filter((item) => item.id !== id));
    setSelectedTianyuId(null);
    invalidateTianyuBoard();
  }

  function handleTianyuPhotoClick(event: React.MouseEvent<HTMLDivElement>) {
    const wall = event.currentTarget;
    const rect = wall.getBoundingClientRect();
    const tap = { x: event.clientX - rect.left - wall.clientLeft, y: event.clientY - rect.top - wall.clientTop };
    if (!tianyuAnnotating) {
      const target = pickTianyuPhotoTarget(tianyuHolds.map(hold => ({ ...boardToPhoto(hold.x, hold.y), radius: hold.radius, id: hold.id, hold })), tap,
        { width: wall.clientWidth, height: wall.clientHeight }, window.matchMedia('(any-pointer: coarse)').matches);
      if (target) selectTianyuRoutePoint(target.hold);
      else setSelectedTianyuId(null);
      return;
    }
    if (tianyuEditor) return;
    const point = photoToBoard(
      tap.x / wall.clientWidth * 100,
      tap.y / wall.clientHeight * 100,
    );
    if (!point) {
      setTianyuStorageMessage("请在橙色板面边界内点击岩点中心。");
      return;
    }
    addTianyuHold(point);
  }

  function startTianyuMove(event: React.PointerEvent<HTMLButtonElement>, point: TianyuHold) {
    if (tianyuLoading) return;
    if (!tianyuAnnotating || tianyuEditor || isGenerating) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    setSelectedTianyuId(point.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    tianyuDragRef.current = { id: point.id, pointerId: event.pointerId };
  }

  function moveTianyuHold(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tianyuDragRef.current;
    const wall = wallRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !wall) return;
    const rect = wall.getBoundingClientRect();
    const point = photoToBoard(
      ((event.clientX - rect.left - wall.clientLeft) / wall.clientWidth) * 100,
      ((event.clientY - rect.top - wall.clientTop) / wall.clientHeight) * 100,
    );
    if (!point) return;
    setTianyuHolds((current) => current.map((item) => item.id === drag.id ? { ...item, ...point, humanEdited: true, confirmed: true } : item));
    invalidateTianyuBoard();
  }

  function finishTianyuMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (tianyuDragRef.current?.pointerId === event.pointerId) tianyuDragRef.current = null;
  }

  function changeTianyuAngle(value: string) {
    if (tianyuLoading || tianyuEditor) return;
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setTianyuAngle(next);
    invalidateTianyuBoard();
  }

  function saveTianyuBoard() {
    if (tianyuLoading || tianyuEditor) return;
    const savedAt = new Date().toISOString();
    const stored: StoredTianyuBoard = {
      version: 2,
      reviewRevision: tianyuReviewRevision,
      savedAt,
      angle: tianyuAngle,
      holds: tianyuHolds,
    };
    try {
      window.localStorage.setItem(tianyuBoardStorageKey, JSON.stringify(stored));
      setHasSavedTianyuBoard(true);
      setTianyuSavedAt(savedAt);
      setTianyuDirty(false);
      setTianyuStorageMessage("点位图与当前角度已保存到本机浏览器。");
    } catch {
      setTianyuStorageMessage("保存失败：当前浏览器不允许本地存储。");
    }
  }

  function generateRandomFixedBoard() {
    const catalog = payload?.holds ?? [];
    const eligible = catalog.filter((hold) => hold.grip !== "造型");
    const source = eligible.length >= 6 ? eligible : catalog;
    if (source.length < 6) {
      updateModeSession("fixed", { generationError: "岩点库数量不足，无法生成固定板。" });
      return;
    }

    const positions = randomFixedBoardPositions().slice(0, Math.min(randomFixedBoardHoldCount, source.length));
    const easyHolds = shuffled(source.filter((hold) => ["把手", "开放点"].includes(hold.grip)));
    const allHolds = shuffled(source);
    const used = new Set<string>();
    const takeUnused = (pool: Hold[]) => pool.find((hold) => !used.has(hold.id));
    const generationId = Date.now();
    const next = positions.map((position, index) => {
      const isStartOrFinishBand = position.y >= 74 || position.y <= 26;
      const hold = (isStartOrFinishBand ? takeUnused(easyHolds) : undefined)
        ?? takeUnused(allHolds)
        ?? source[index % source.length];
      used.add(hold.id);
      return {
        instanceId: `fixed-${generationId}-${index}-${hold.id}`,
        hold,
        x: position.x,
        y: position.y,
        rotation: (Math.floor(Math.random() * 7) - 3) * 15,
        scale: 1,
        role: "manual" as const,
        routeColor: "#ff5a36",
      } satisfies Placement;
    });

    setFixedBoardPlacements(next);
    setSelectedId(null);
    setFixedBoardDirty(true);
    setBoardStorageMessage(null);
    updateModeSession("fixed", {
      candidates: [],
      activeCandidateId: null,
      manualReviewRequired: false,
      generationError: null,
      generationNotice: null,
      parsedConstraints: null,
      constraintWarnings: [],
    });
    setRandomBoardDialogOpen(false);
  }

  function requestRandomFixedBoard() {
    if (fixedBoardPlacements.length === 0) generateRandomFixedBoard();
    else setRandomBoardDialogOpen(true);
  }

  function saveFixedBoard() {
    if (fixedBoardPlacements.length === 0) return;
    const savedAt = new Date().toISOString();
    const stored: StoredFixedBoard = {
      version: 1,
      savedAt,
      placements: fixedBoardPlacements.map((placement) => ({
        instanceId: placement.instanceId,
        holdId: placement.hold.id,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation,
        scale: placement.scale,
      })),
    };
    try {
      window.localStorage.setItem(fixedBoardStorageKey, JSON.stringify(stored));
      setHasSavedFixedBoard(true);
      setFixedBoardSavedAt(savedAt);
      setFixedBoardDirty(false);
      setBoardStorageMessage(null);
    } catch {
      setBoardStorageMessage("保存失败：当前浏览器不允许本地存储。");
    }
  }

  function changeRouteMode(value: string) {
    if (workspace !== "operations" || isGenerating || (value !== "free" && value !== "fixed")) return;
    setRouteMode(value);
    setSelectedId(null);
    setSelectedTianyuId(null);
    setHoveredRouteId(null);
    dragRef.current = null;
    tianyuDragRef.current = null;
    setPendingCandidate(null);
    setReplaceDialogOpen(false);
    setClearDialogOpen(false);
    setRandomBoardDialogOpen(false);
  }

  const appHeader = (
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Grip size={20} /></div>
          <div>
            <h1>{workspace === "training-board" ? "训练板定线" : "岩馆定线台"}</h1>
            <p>{routeMode === "tianyu" ? `天宇训练板 · ${displayedTianyuAngle}°仰角` : routeMode === 'free' ? '天宇一楼 · 6 段三维墙面' : "4 × 4 m 直壁 · 20 cm 网格"}</p>
          </div>
        </div>
        <Tabs className="mode-switch" value={routeMode} onValueChange={changeRouteMode}>
          <TabsList aria-label={workspace === "training-board" ? "训练板选择" : "定线模式"}>
            {workspace === "operations" ? <>
              <TabsTrigger value="free" disabled={isGenerating}>自由定线</TabsTrigger>
              <TabsTrigger value="fixed" disabled={isGenerating}>固定板定线</TabsTrigger>
            </> : <TabsTrigger value="tianyu" disabled={isGenerating}>天宇训练板</TabsTrigger>}
          </TabsList>
        </Tabs>
        <div className="header-status">
          <span className="status-dot" />
          AI 辅助定线
          <span className="status-divider" />
          {workspace === "training-board"
            ? tianyuLoading ? "正在加载训练板" : `${tianyuHolds.length} 个已安装点位`
            : payload ? `${payload.meta.count} 个独立资产` : "正在整理岩点库"}
        </div>
      </header>
  );
  const libraryPanel = (
        <aside className="tool-panel library-panel">
          {routeMode === "tianyu" ? (
            <>
              <div className="panel-heading">
                <div><span className="eyebrow">现场数据</span><h2>天宇板点位图</h2></div>
                <span className="count-chip">{tianyuHolds.length}</span>
              </div>

              <div className="tianyu-capture-card">
                <MapPin size={18} />
                <div>
                  <strong>4 × 4 m 实物板 · 已矫正为正方形</strong>
                  <span>已复核照片点位，并补充照片与扫描表面的配准资料；0° 为直壁，60° 为最大仰角。</span>
                </div>
              </div>

              {tianyuRegistration && <TianyuRegistrationSummary report={tianyuRegistration} holds={tianyuHolds} />}

              <Button
                className={tianyuAnnotating ? "annotation-toggle active" : "annotation-toggle"}
                variant="outline"
                disabled={tianyuLoading || Boolean(tianyuEditor) || isGenerating}
                onClick={() => setTianyuAnnotating((current) => !current)}
              >
                <MousePointer2 size={16} />
                {tianyuAnnotating ? "正在编辑 · 点击补点 / 拖动微调" : "手工修改点位"}
              </Button>

              <div className="tianyu-seed-actions">
                {tianyuPendingCount > 0 && <Button variant="outline" size="sm" onClick={confirmAllTianyuHolds} disabled={Boolean(tianyuEditor) || isGenerating}>
                  <Check size={14} />确认剩余点位
                </Button>}
                <Button variant="outline" size="sm" onClick={() => setRestoreTianyuDialogOpen(true)} disabled={tianyuAutoSeed.length === 0 || Boolean(tianyuEditor) || isGenerating}>
                  <RotateCcw size={14} />恢复 GPT-6 复核版
                </Button>
              </div>

              <div className="capture-checklist">
                {tianyuLoading && <div role="status"><LoaderCircle size={14} className="spin" /><span>正在载入复核点位和本机存档…</span></div>}
                <div><Check size={14} /><span>有效板面已裁切、透视矫正并映射到 0–100 坐标</span></div>
                <div className={confirmedTianyuHolds.length >= 6 ? "done" : ""}>
                  {confirmedTianyuHolds.length >= 6 ? <Check size={14} /> : <MapPin size={14} />}
                  <span>已确认 {confirmedTianyuHolds.length} 点 · 待确认 {tianyuPendingCount} 点</span>
                </div>
                <div className={tianyuVerticalCoverage >= 42 ? "done" : ""}>
                  {tianyuVerticalCoverage >= 42 ? <Check size={14} /> : <MapPin size={14} />}
                  <span>纵向覆盖 {(tianyuVerticalCoverage * 0.04).toFixed(2)} m，至少需要 1.68 m</span>
                </div>
              </div>

              {selectedTianyuHold && !tianyuEditor ? (
                <div className="tianyu-inspector">
                  <div className="inspector-title">
                    <div><span>所选点位</span><strong>{selectedTianyuHold.serial}</strong></div>
                    <small>横向 {(selectedTianyuHold.x * 0.04).toFixed(2)} m · 沿板面距板底 {((100 - selectedTianyuHold.y) * 0.04).toFixed(2)} m</small>
                  </div>
                  <div className="tianyu-point-meta">
                    <span className={selectedTianyuHold.source === "auto" ? "auto" : "manual"}>
                      {selectedTianyuHold.humanEdited ? "人工已调整" : selectedTianyuHold.source === "reviewed" ? "GPT-6 复核" : selectedTianyuHold.source === "auto" ? "AI 初标" : "人工新增"}
                    </span>
                    <span className={selectedTianyuHold.confirmed ? "confirmed" : "pending"}>
                      {selectedTianyuHold.confirmed ? "已确认" : "待确认"}
                    </span>
                  </div>
                  <TianyuRegistrationInspector point={selectedTianyuHold} report={tianyuRegistration} />
                  <label>
                    <span>抓握类型</span>
                    <Select value={selectedTianyuHold.grip} onValueChange={(value) => updateTianyuHold(selectedTianyuHold.id, { grip: value })}>
                      <SelectTrigger aria-label="抓握类型"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tianyuGripOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    <span>尺寸估计</span>
                    <Select value={selectedTianyuHold.size} onValueChange={(value) => updateTianyuHold(selectedTianyuHold.id, { size: value })}>
                      <SelectTrigger aria-label="尺寸估计"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tianyuSizeOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    <span>颜色</span>
                    <Input aria-label="点位颜色" value={selectedTianyuHold.color ?? ""} onChange={(event) => updateTianyuHold(selectedTianyuHold.id, { color: event.target.value })} />
                  </label>
                  <label>
                    <span>可见外形</span>
                    <Input aria-label="点位外形" value={selectedTianyuHold.shape ?? ""} onChange={(event) => updateTianyuHold(selectedTianyuHold.id, { shape: event.target.value })} />
                  </label>
                  <label>
                    <span>用途建议</span>
                    <Select value={selectedTianyuHold.usage || "未知"} onValueChange={(value) => updateTianyuHold(selectedTianyuHold.id, { usage: value })}>
                      <SelectTrigger aria-label="用途建议"><SelectValue /></SelectTrigger>
                      <SelectContent>{["手脚兼用", "脚点优先", "未知"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  <label>
                    <span>复核备注 / 人工补充</span>
                    <Textarea aria-label="点位备注" value={selectedTianyuHold.notes ?? ""} onChange={(event) => updateTianyuHold(selectedTianyuHold.id, { notes: event.target.value })} />
                  </label>
                  <p className="library-footnote">点位已确认；抓握、尺寸和用途为视觉估计，并非实测参数。</p>
                  <div className="tianyu-inspector-actions">
                    {!selectedTianyuHold.confirmed && (
                      <Button variant="outline" size="sm" onClick={() => updateTianyuHold(selectedTianyuHold.id, { confirmed: true })}>
                        <Check size={15} />确认此点
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => removeTianyuHold(selectedTianyuHold.id)}>
                      <Trash2 size={15} />删除点位
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="tianyu-selection-help">
                  <strong>{tianyuEditor ? '手工线路编辑中 · 板面锁定' : tianyuBoardReady ? "点位已确认，可直接定线" : "保留完整手工编辑能力"}</strong>
                  <span>{tianyuEditor ? '点击板上岩点加入线路，在人工定线区设置起步、用途和动作顺序。移除线路用点不会删除板面岩点；结束线路编辑后可继续维护板面。' : '点击点位查看颜色、外形和用途。开启手工修改后可拖动、用方向键微调、删除或补点；修改后仍为已确认状态，保存后下次继续使用。'}</span>
                </div>
              )}

              <div className={`tianyu-save-status ${tianyuDirty ? "dirty" : hasSavedTianyuBoard ? "saved" : ""}`}>
                {tianyuBoardSavedLabel}
              </div>
              {tianyuStorageMessage && <div className="ai-warning" role="status">{tianyuStorageMessage}</div>}
              <p className="library-footnote">GLB 有覆盖的点已建立逐点表面关联；顶部约 15% 无扫描，局部证据不足的点标为待复核。配准不等于整颗岩点分割，不推断精确抓深、摩擦或受力方向。照片点位均保留定线和人工修改能力。</p>
            </>
          ) : (
            <>
              <div className="panel-heading">
                <div><span className="eyebrow">岩点资产</span><h2>单点岩点库</h2></div>
                <span className="count-chip">{holds.length}</span>
              </div>

              <label className="search-box">
                <Search size={17} />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="编号、材质、抓握类型"
                  aria-label="搜索岩点"
                />
                {query && (
                  <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X size={14} /></button>
                )}
              </label>

              <div className="filter-row" aria-label="按材质筛选">
                {materialFilters.map((item) => (
                  <button
                    className={material === item ? "filter-chip active" : "filter-chip"}
                    key={item}
                    type="button"
                    onClick={() => setMaterial(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="hold-list" aria-label="可用岩点">
                {!payload && [0, 1, 2, 3].map((item) => (
                  <div className="hold-skeleton" key={item}>
                    <Skeleton className="h-[58px] w-16 rounded-lg" />
                    <div><Skeleton className="mb-2 h-3 w-28" /><Skeleton className="h-3 w-20" /></div>
                  </div>
                ))}
                {payload && holds.length === 0 && (
                  <div className="empty-list"><Search size={21} /><strong>没有匹配的岩点</strong><span>换一个编号、材质或抓握类型试试。</span></div>
                )}
                {holds.map((hold) => (
                  <article
                    className={`hold-card ${routeMode === 'free' && pendingFloorHold?.id === hold.id ? 'floor-pending-asset' : ''}`}
                    draggable
                    key={hold.id}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/hold-id", hold.id);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <button
                      className="hold-image-wrap"
                      type="button"
                      onClick={() => { if (routeMode === 'free') { setPendingFloorHold(hold); setSelectedId(null); } else addToWall(hold); }}
                      aria-label={`把 ${hold.serial} 添加到墙面`}
                    >
                      <img src={hold.image} alt={`${hold.serial} ${hold.description}`} />
                    </button>
                    <div className="hold-card-copy">
                      <strong>{hold.serial}</strong>
                      <span>{hold.grip} · {hold.size}</span>
                      <small>{hold.material} / {hold.brand}</small>
                    </div>
                    <span className="drag-hint">{routeMode === 'free' ? '选' : '拖'}</span>
                  </article>
                ))}
              </div>
              <p className="library-footnote">
                已排除 {payload?.meta.excludedSets ?? 399} 个多件套装；
                {routeMode === "fixed"
                  ? "先用图片点击或拖拽完成固定板，AI 只会从板上已安装点中选线。"
                  : "先选岩点，再轻点三维墙面放置；鼠标也可拖拽上墙。"}
              </p>
            </>
          )}
        </aside>
  );
  const wallPanel = (
        <section className="wall-stage" aria-label="定线墙面工作区">
          <div className="wall-toolbar">
            <div>
              <span className="eyebrow dark">{routeMode === "tianyu" ? "实物板 TY-01" : routeMode === "fixed" ? "固定板 01" : "墙面 01"}</span>
              <h2>{routeMode === "tianyu" ? "天宇训练板正面图" : routeMode === "fixed" ? "固定板布点" : "直壁正视图"}</h2>
            </div>
            <div className="wall-actions">
              <div className="wall-metrics">
                <span>{routeMode === "tianyu" ? `${currentPointCount} 个点位 · ${confirmedTianyuHolds.length} 已确认` : `${currentPointCount} ${routeMode === "free" ? "个岩点" : "个已安装"}`}</span>
                <span>{routeListPoints.length > 0 ? `${routeListPoints.length} 个独立线路点` : routeMode === "tianyu" ? `${tianyuAngle}° 仰角` : "比例 1:20"}</span>
                {routeMode === "fixed" && (
                  <span className={`board-save-chip ${fixedBoardDirty ? "dirty" : hasSavedFixedBoard ? "saved" : ""}`}>
                    {fixedBoardSavedLabel}
                  </span>
                )}
                {routeMode === "tianyu" && (
                  <span className={`board-save-chip ${tianyuDirty ? "dirty" : hasSavedTianyuBoard ? "saved" : ""}`}>
                    {tianyuBoardSavedLabel}
                  </span>
                )}
              </div>
              {routeMode === "fixed" && (
                <div className="fixed-board-controls">
                  <Button variant="outline" size="sm" onClick={requestRandomFixedBoard} disabled={!payload}>
                    <Dices size={15} />
                    随机生成
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveFixedBoard}
                    disabled={fixedBoardPlacements.length === 0 || !fixedBoardDirty}
                  >
                    <Save size={15} />
                    保存固定板
                  </Button>
                </div>
              )}
              {routeMode === "tianyu" && (
                <div className="tianyu-board-controls">
                  <Select value={String(tianyuEditor?.document.board.angle ?? tianyuAngle)} onValueChange={changeTianyuAngle} disabled={isGenerating || tianyuLoading || Boolean(tianyuEditor)}>
                    <SelectTrigger aria-label="天宇板仰角"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tianyuAngles.map((angle) => <SelectItem key={angle} value={String(angle)}>{angle}°</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={boardMaintenanceOpen ? "default" : "outline"}
                    size="sm"
                    aria-expanded={boardMaintenanceOpen}
                    aria-controls="tianyu-board-maintenance"
                    onClick={() => {
                      const next = !boardMaintenanceOpen;
                      setBoardMaintenanceOpen(next);
                      if (next) { setActiveTianyuTool('ai'); setTianyuToolsCollapsed(false); requestAnimationFrame(() => boardMaintenanceRef.current?.scrollIntoView({ block: 'nearest' })); }
                      else { setTianyuAnnotating(false); setTianyuImageMode('photo'); }
                    }}
                  >
                    <MousePointer2 size={15} />
                    {boardMaintenanceOpen ? "收起点位维护" : "点位图维护"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isGenerating || tianyuLoading || tianyuRouteBusy} onClick={() => openTianyuRoute({ dirty: true, document: newTianyuRoute(tianyuHolds, tianyuAngle, tianyuReviewRevision) })}>手工定线</Button>
                  {boardMaintenanceOpen && <Button
                    variant="outline"
                    size="sm"
                    onClick={saveTianyuBoard}
                    disabled={tianyuLoading || tianyuHolds.length === 0 || !tianyuDirty || Boolean(tianyuEditor)}
                  >
                    <Save size={15} />
                    保存天宇板
                  </Button>}
                </div>
              )}
              {(routeMode !== 'tianyu' || boardMaintenanceOpen) && <Button
                variant="outline"
                size="sm"
                disabled={currentPointCount === 0 || (routeMode === 'tianyu' && (Boolean(tianyuEditor) || isGenerating))}
                onClick={() => setClearDialogOpen(true)}
              >
                {routeMode === 'tianyu' ? '清空点位图' : '清空'}
              </Button>}
            </div>
          </div>

          {(routeListPoints.length > 0 || routeMode === 'tianyu') && (
            <div className="route-display-controls" aria-label="线路显示设置">
              <div className="route-legend">
                <span><i className="role-start" />起步（手 / 脚）</span>
                <span><i className="role-move" />手点</span>
                <span><i className="role-foot" />脚点</span>
                <span><i className="role-finish" />终点</span>
              </div>
              <label><input type="checkbox" checked={showRouteNumbers} onChange={(event) => setShowRouteNumbers(event.target.checked)} />显示编号</label>
              {routeMode === 'tianyu' && <label><input type="checkbox" aria-label="显示线路标记" checked={showTianyuRouteMarks} onChange={event => setShowTianyuRouteMarks(event.target.checked)} />线路标记</label>}
              <div className="route-focus-summary" aria-live="polite">
                {focusedRoutePoint ? <><strong>#{routeNumberById.get(focusedRoutePoint.instanceId)} · {focusedRoutePoint.hold.serial}</strong><span>{routePointDescription(focusedRoutePoint)} · {focusedRoutePoint.hold.grip} · {focusedRoutePoint.hold.size}{focusedRoutePoint.technique ? ` · ${focusedRoutePoint.technique}` : ""}</span></> : routeMode === 'tianyu' ? <span>{selectedTianyuHold ? `已选 ${selectedTianyuHold.serial} · ${selectedTianyuHold.grip} · ${selectedTianyuHold.size}` : '直接触摸照片选择岩点；点击“手工定线”后，选点即可加入线路。'}</span> : <span>悬停、点击岩点或下方清单查看详情；默认只显示空心标记，不遮挡抓握面。</span>}
              </div>
            </div>
          )}

          {routeMode === "tianyu" && tianyuRegistration && boardMaintenanceOpen && <div className="tianyu-registration-controls" aria-label="配准对照">
            <span>配准对照</span>
            {(["photo", "overlay", "scan"] as const).map((mode) => <Button key={mode} size="sm" variant={tianyuImageMode === mode ? "default" : "outline"} aria-pressed={tianyuImageMode === mode} onClick={() => setTianyuImageMode(mode)}>{({ photo: "照片", overlay: "照片 + GLB", scan: "GLB 投影" })[mode]}</Button>)}
            {tianyuImageMode === "overlay" && <label>扫描透明度<input aria-label="扫描透明度" type="range" min="0" max="1" step="0.05" value={tianyuOverlayOpacity} onChange={(event) => setTianyuOverlayOpacity(Number(event.target.value))} /></label>}
            <small>点击岩点查看其配准状态；GLB 投影留白处没有扫描。</small>
          </div>}

          <div className="wall-frame">
            {routeMode === "tianyu" ? (
              <div
                className={`climbing-wall tianyu-wall ${tianyuAnnotating ? "is-annotating" : ""} ${boardMaintenanceOpen ? 'show-point-markers' : ''} ${showTianyuRouteMarks ? '' : 'hide-route-markers'} ${tianyuEditor ? 'is-route-editing' : ''} ${tianyuRouteVisible ? "route-preview-active" : ""}`}
                ref={wallRef}
                onClick={handleTianyuPhotoClick}
              >
                <img className="tianyu-photo" style={{ opacity: tianyuImageMode === "scan" ? 0 : 1 }} src="/boards/tianyu/front-square.jpg" alt="天宇4乘4米可调角度训练板透视矫正正面照片" draggable={false} />
                {tianyuRegistration && tianyuImageMode !== "photo" && <img className="tianyu-photo tianyu-registration-overlay" style={{ opacity: tianyuImageMode === "scan" ? 1 : tianyuOverlayOpacity }} src={tianyuRegistration.assets.projection} alt="与照片配准后的原始 GLB 投影，顶部空白为扫描缺失区域" draggable={false} />}
                {boardMaintenanceOpen && <svg className="tianyu-board-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={`${tianyuPhotoQuad.topLeft.x},${tianyuPhotoQuad.topLeft.y} ${tianyuPhotoQuad.topRight.x},${tianyuPhotoQuad.topRight.y} ${tianyuPhotoQuad.bottomRight.x},${tianyuPhotoQuad.bottomRight.y} ${tianyuPhotoQuad.bottomLeft.x},${tianyuPhotoQuad.bottomLeft.y}`} />
                </svg>}
                <div className="tianyu-photo-badge" hidden={!boardMaintenanceOpen || tianyuRouteVisible}>
                  <strong>TY-01 · 4 × 4 m</strong>
                  <span>{tianyuAngle}° 仰角 · 透视矫正正方形</span>
                </div>
                {tianyuHolds.length === 0 && (
                  <div className="tianyu-empty">
                    <MapPin size={24} />
                    <strong>尚未建立点位图</strong>
                    <span>展开“点位图维护”，启用手工修改后点击岩点中心</span>
                  </div>
                )}
                {tianyuHolds.map((point) => {
                  const photoPoint = boardToPhoto(point.x, point.y);
                  const routePoint = activeTianyuRouteByInstance.get(point.id);
                  return (
                    <button
                      className={`tianyu-hotspot role-${routePoint ? visualRole(routePoint) : "manual"} source-${point.source} ${point.confirmed ? "confirmed" : "auto-pending"} ${selectedTianyuId === point.id ? "selected" : ""} ${focusedRouteId === point.id ? "route-focused" : ""} ${tianyuRouteVisible ? routePoint ? "route-active" : "route-muted" : ""}`}
                      key={point.id}
                      style={{
                        left: `${photoPoint.x}%`,
                        top: `${photoPoint.y}%`,
                        "--route-color": routePoint?.routeColor ?? "#ff7a45",
                      } as React.CSSProperties}
                      type="button"
                      aria-pressed={selectedTianyuId === point.id}
                      title={[point.serial, routePoint ? routePointDescription(routePoint) : "", point.color, point.shape, point.grip, point.size, point.confirmed ? "已确认" : "待确认"].filter(Boolean).join(" · ")}
                      aria-label={[point.serial, routePoint ? routePointDescription(routePoint) : "", point.grip].filter(Boolean).join(" · ")}
                      onClick={(event) => { event.stopPropagation(); selectTianyuRoutePoint(point); }}
                      onPointerEnter={() => setHoveredRouteId(point.id)}
                      onPointerLeave={() => setHoveredRouteId(null)}
                      onFocus={() => setSelectedTianyuId(point.id)}
                      onPointerDown={(event) => startTianyuMove(event, point)}
                      onPointerMove={moveTianyuHold}
                      onPointerUp={finishTianyuMove}
                      onPointerCancel={finishTianyuMove}
                      onKeyDown={(event) => {
                        if (tianyuEditor || !tianyuAnnotating) return;
                        const direction: Record<string, Point2D> = {
                          ArrowLeft: { x: clamp(point.x - 0.5, 0, 100), y: point.y },
                          ArrowRight: { x: clamp(point.x + 0.5, 0, 100), y: point.y },
                          ArrowUp: { x: point.x, y: clamp(point.y - 0.5, 0, 100) },
                          ArrowDown: { x: point.x, y: clamp(point.y + 0.5, 0, 100) },
                        };
                        if (direction[event.key]) {
                          event.preventDefault();
                          updateTianyuHold(point.id, direction[event.key]);
                        }
                        if (event.key === "Delete" || event.key === "Backspace") removeTianyuHold(point.id);
                      }}
                    >
                      <span className="hotspot-core" />
                      {routePoint && showRouteNumbers && <span className={`route-label ${point.x > 88 ? "label-left" : ""} ${point.y < 5 ? "label-below" : ""}`}>{routeNumberById.get(point.id)}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className={`climbing-wall ${routeMode === "fixed" && activeFixedCandidate ? "route-preview-active" : ""}`}
                ref={wallRef}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setSelectedId(null);
                }}
              >
                <span className="wall-axis wall-axis-y">4.0 m</span>
                <span className="wall-axis wall-axis-x">4.0 m</span>
                {placements.length === 0 && (
                  <div className="wall-empty">
                    <Grip size={28} />
                    <strong>{routeMode === "fixed" ? "先建立固定板" : "拖一个岩点到墙上"}</strong>
                    <span>{routeMode === "fixed" ? "从左侧拖拽岩点，覆盖起步区、中段和顶部" : "也可以点击左侧岩点快速添加"}</span>
                  </div>
                )}
                {displayPlacements.map((placement) => (
                  <button
                    className={`placed-hold role-${visualRole(placement)} ${selectedId === placement.instanceId ? "selected" : ""} ${focusedRouteId === placement.instanceId ? "route-focused" : ""} ${placement.role !== "manual" ? "has-route-role" : ""} ${routeMode === "fixed" && activeFixedCandidate ? placement.role === "manual" ? "route-muted" : "route-active" : ""}`}
                    key={placement.instanceId}
                    style={{
                      left: `${placement.x}%`,
                      top: `${placement.y}%`,
                      width: `${(sizePixels[placement.hold.size] ?? 48) * placement.scale}px`,
                      transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                      "--route-color": placement.routeColor,
                      "--hold-rotation": `${placement.rotation}deg`,
                    } as React.CSSProperties}
                    type="button"
                    title={`${placement.hold.serial} · ${routePointDescription(placement)} · ${placement.hold.grip}`}
                    aria-label={`${placement.hold.serial} · ${routePointDescription(placement)}`}
                    onPointerEnter={() => setHoveredRouteId(placement.instanceId)}
                    onPointerLeave={() => setHoveredRouteId(null)}
                    onFocus={() => setSelectedId(placement.instanceId)}
                    onPointerDown={(event) => startMove(event, placement)}
                    onPointerMove={moveHold}
                    onPointerUp={finishMove}
                    onPointerCancel={finishMove}
                    onKeyDown={(event) => {
                      const direction: Record<string, Partial<Placement>> = {
                        ArrowLeft: { x: snap(placement.x - 5) },
                        ArrowRight: { x: snap(placement.x + 5) },
                        ArrowUp: { y: snap(placement.y - 5) },
                        ArrowDown: { y: snap(placement.y + 5) },
                      };
                      if (direction[event.key]) {
                        event.preventDefault();
                        updatePlacement(placement.instanceId, direction[event.key]);
                      }
                      if (event.key === "Delete" || event.key === "Backspace") removePlacement(placement.instanceId);
                    }}
                  >
                    <img src={placement.hold.image} alt={placement.hold.serial} draggable={false} />
                    {placement.role !== "manual" && showRouteNumbers && <span className="route-label">{routeNumberById.get(placement.instanceId)}</span>}
                  </button>
                ))}

                {selectedPlacement && (
                  <div className="selection-toolbar" onPointerDown={(event) => event.stopPropagation()}>
                    <div className="selected-name">
                      <strong>{selectedPlacement.hold.serial}</strong>
                      <span>{selectedPlacement.hold.grip} · {selectedPlacement.hold.size}</span>
                    </div>
                    <Button aria-label="逆时针旋转" variant="outline" size="sm" onClick={() => updatePlacement(selectedPlacement.instanceId, { rotation: selectedPlacement.rotation - 15 })}><RotateCcw size={15} /></Button>
                    <Button aria-label="顺时针旋转" variant="outline" size="sm" onClick={() => updatePlacement(selectedPlacement.instanceId, { rotation: selectedPlacement.rotation + 15 })}><RotateCw size={15} /></Button>
                    <Button
                      aria-label="删除岩点"
                      variant="destructive"
                      size="sm"
                      onClick={() => removePlacement(selectedPlacement.instanceId)}
                    ><Trash2 size={15} /></Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {routeListPoints.length > 0 && (
            <details className="route-point-list" open={routeMode !== 'tianyu'}>
              <summary>线路清单 · {routeListPoints.length} 个独立点位 <span>所有用途已去重；编号用于找点，不代表动作顺序</span></summary>
              <div className="route-point-items">
                {routeListPoints.map((point, index) => (
                  <button key={point.instanceId} type="button"
                    className={`route-point-item role-${visualRole(point)} ${focusedRouteId === point.instanceId ? "active" : ""}`}
                    onPointerEnter={() => setHoveredRouteId(point.instanceId)}
                    onPointerLeave={() => setHoveredRouteId(null)}
                    onFocus={() => setHoveredRouteId(point.instanceId)}
                    onBlur={() => setHoveredRouteId(null)}
                    onClick={() => routeMode === "tianyu" ? setSelectedTianyuId(point.instanceId) : setSelectedId(point.instanceId)}>
                    <i aria-hidden="true" /><strong>{index + 1}. {point.hold.serial}</strong><span>{routePointDescription(point)}</span>
                  </button>
                ))}
              </div>
              {activeDisplayCandidate && <p className="route-start-note">起步标记对应四肢位置：3 点通常为双手共点 + 两个脚点，4 点为双手、双脚各一点；具体以清单标注为准。</p>}
            </details>
          )}
          <div className="safety-note">
            {tianyuEditor ? '人工线路草稿：不沿用 AI 候选评分。保存前请检查起步、终点与动作，实际使用前必须人工检查和试爬。' : manualReviewRequired
              ? routeMode !== "free"
                ? routeMode === "tianyu"
                  ? "点位、属性或角度已调整，原候选已失效；请重新生成后再试爬复核。"
                  : "固定板已调整，原候选已失效；请重新生成后再复核 Beta。"
                : "墙面已经过人工调整，原候选校验结果不再适用；请重新生成或由专业定线员复核。"
              : routeMode !== "free"
                ? routeMode === "tianyu"
                  ? `候选只选择照片中已确认点位；${tianyuAngle}°只用于动作规划和难度修正，实际使用前仍需试爬。`
                  : "固定板候选只选择已安装点，不会移动岩点。实际使用前仍需由专业定线员试爬复核。"
                : "候选方案仅用于定线草案。实际安装前需由专业定线员复核动作安全、旋转风险与落地区域。"}
          </div>
        </section>
  );
  const aiPanel = (
        <aside id={routeMode === 'tianyu' ? 'tianyu-ai-panel' : undefined} aria-label="AI 辅助定线" className={`tool-panel ai-panel ${routeMode !== "free" ? "fixed-mode" : ""}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">辅助定线</span>
              <h2>{routeMode === "tianyu" ? "在天宇板上生成线路" : routeMode === "fixed" ? "从固定板生成线路" : "生成候选方案"}</h2>
            </div>
            <Sparkles size={20} className="accent-icon" />
          </div>
          {routeMode === 'free' && <div className="fixed-mode-note"><strong>{getFace(floorFaceId)?.label}</strong><span>在当前墙段约 {workingArea(floorFaceId).widthM.toFixed(2)} × {workingArea(floorFaceId).heightM.toFixed(2)} m 作业区生成，按实际尺寸与倾角校验；采用后可在 3D 墙面继续调整。</span></div>}
          {routeMode === "fixed" && (
            <div className="fixed-mode-note">
              <strong>板面位置锁定</strong>
              <span>AI 只从当前 {fixedBoardPlacements.length} 个已安装点中选择线路，不生成新坐标。保存后，下次打开会自动恢复这块板。</span>
            </div>
          )}
          {routeMode === "tianyu" && (
            <div className="fixed-mode-note tianyu-mode-note">
              <strong>现场点位与角度锁定</strong>
              <span>AI 从已确认的 {confirmedTianyuHolds.length} 个岩点中选线，结合颜色、外形、用途建议和 {tianyuAngle}° 仰角规划。{tianyuPendingCount > 0 ? `${tianyuPendingCount} 个待确认点暂不参与。` : "无需再次逐点确认。"}</span>
            </div>
          )}
          {routeMode === "fixed" && boardStorageMessage && (
            <div className="ai-warning" role="status">{boardStorageMessage}</div>
          )}
          <label className="prompt-box">
            <span>定线要求</span>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={routeMode !== "free"
                ? "例如：V6，4 点起步，技术型，包含一次横移；点数可不填"
                : "例如：V6，3 点起步，动作连贯，避免无用点；点数可不填"}
              rows={5}
            />
          </label>
          {routeMode === 'tianyu' && tianyuEditor && <p className="ai-warning">正在编辑人工线路。请先保存并结束线路编辑，再生成新的 AI 候选。</p>}
          <div className="model-picker">
            <span>定线模型</span>
            <Select value={model} onValueChange={(value) => setModel(value as RouteModel)} disabled={isGenerating}>
              <SelectTrigger aria-label="选择定线模型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {routeModels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="prompt-examples" aria-label="提示词示例">
            {promptExamples.map((example) => (
              <button key={example.label} type="button" onClick={() => setPrompt(example.prompt)}>{example.label}</button>
            ))}
          </div>
          <Button
            className="generate-button"
            onClick={() => void generateFromPrompt()}
            disabled={(routeMode !== "tianyu" && !payload) || prompt.trim().length < 3 || isGenerating || (routeMode === "fixed" && !fixedBoardReady) || (routeMode === "tianyu" && (!tianyuBoardReady || Boolean(tianyuEditor)))}
            title={routeMode === "fixed" && !fixedBoardReady
              ? "固定板至少需要 6 个已安装点"
              : routeMode === "tianyu" && !tianyuBoardReady
                ? "至少确认 6 点，并覆盖底部到顶部 1.68 米"
                : undefined}
          >
            {isGenerating ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />}
            {isGenerating
              ? `正在生成 · ${elapsedSeconds} 秒`
              : routeMode !== "free"
                ? routeMode === "tianyu" ? `生成 3 条天宇板路线 · ${tianyuAngle}°` : "生成 3 条固定板路线"
                : "生成 3 条候选路线"}
          </Button>

          {isGenerating && (
            <div className="generation-progress" role="status" aria-live="polite">
              <div className="generation-progress-head">
                <span className="thinking-pulse" aria-hidden="true" />
                <div>
                  <strong>{progress.label}</strong>
                  <span>{progress.detail}</span>
                </div>
                <time>{elapsedSeconds}s</time>
              </div>
              <Progress value={progress.value} aria-label="AI 定线预计进度" />
              <p>{activeModelLabel} 正在处理。此处显示等待阶段，不展示模型内部推理。</p>
            </div>
          )}

          {generationError && <div className="ai-error" role="alert">{generationError}</div>}
          {generationNotice && <div className="ai-warning" role="status">{generationNotice}</div>}
          {parsedConstraints && (
            <div className="constraint-summary" aria-label="已识别的定线约束">
              <span>V{parsedConstraints.grade}</span>
              <span className={parsedConstraints.maxTotalHoldsExplicit ? "hard" : ""}>
                {pointCountLabel(parsedConstraints, routeMode)}
              </span>
              <span>目标动作 {parsedConstraints.targetActions}</span>
              <span>{parsedConstraints.style}</span>
              {routeMode === "tianyu" && <span>{tianyuAngle}°仰角</span>}
            </div>
          )}
          {constraintWarnings.length > 0 && (
            <div className="ai-warning" role="status">{constraintWarnings.join("；")}</div>
          )}

          <div className="candidate-list" aria-live="polite">
            {candidates.length === 0 ? (
              <div className="ai-note">
                {routeMode !== "free"
                  ? routeMode === "tianyu"
                    ? tianyuBoardReady
                      ? `先写目标难度和风格，点数可不填。模型会结合 ${tianyuAngle}° 仰角规划 Beta，本地求解器只选择照片中已确认点位。`
                      : "至少需要 6 个已确认岩点，并覆盖起步区、中段和顶部；可恢复 GPT-6 复核版或手工补点。"
                    : fixedBoardReady
                      ? "先写目标难度和风格，点数可不填。模型规划动作后，本地求解器只在当前固定板上搜索可执行 Beta。"
                      : "先在中间墙面安装至少 6 个岩点，并尽量覆盖底部、中段和顶部。"
                  : "先写目标难度与风格，点数可不填。系统先规划动作，再匹配真实岩点与脚点支撑；不会为凑数量添加无用点。"}
              </div>
            ) : candidates.map((candidate, index) => (
              <article
                className={activeCandidateId === candidate.id ? "candidate-card active" : "candidate-card"}
                key={candidate.id}
                style={{ "--candidate-color": candidate.accent } as React.CSSProperties}
              >
                <div className="candidate-copy">
                  <div className="candidate-index">0{index + 1}</div>
                  <div><strong>{candidate.title}</strong><span>目标 {parsedConstraints ? `V${parsedConstraints.grade}` : candidate.grade}</span></div>
                </div>
                <div className={`mini-wall ${routeMode === "tianyu" ? "tianyu-mini-wall" : ""}`} aria-label={`${candidate.title}路线预览`}>
                  {routeMode === "fixed" && fixedBoardPlacements.map((point) => (
                    <i
                      key={`board-${point.instanceId}`}
                      className="mini-point board-base"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    />
                  ))}
                  {routeMode === "tianyu" && tianyuHolds.map((point) => {
                    const position = boardToPhoto(point.x, point.y);
                    return (
                      <i
                        key={`board-${point.id}`}
                        className="mini-point board-base"
                        style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      />
                    );
                  })}
                  {candidate.placements.map((point) => {
                    const position = routeMode === "tianyu" ? boardToPhoto(point.x, point.y) : point;
                    return (
                      <i
                        key={point.instanceId}
                        className={`mini-point ${visualRole(point)}`}
                        style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      />
                    );
                  })}
                </div>
                <p>{candidate.subtitle}</p>
                <div className="candidate-metrics"><span>{candidate.focus}</span><span>跨度 {candidate.reach}</span></div>
                <div className="candidate-validation" aria-label="候选方案校验结果">
                  <span>独立点 {uniqueRoutePoints(candidate.placements).length}</span>
                  <span>动作 {candidate.metrics.moveCount}</span>
                  <span>起步 {candidate.metrics.startHoldCount ?? candidate.placements.filter((point) => visualRole(point) === "start").length} 点{candidate.metrics.startHandCount !== undefined && candidate.metrics.startFootCount !== undefined ? ` · ${candidate.metrics.startHandCount} 手 + ${candidate.metrics.startFootCount} 脚` : ""}</span>
                  <span>脚点 {candidate.metrics.footCount}</span>
                  <span>支撑 {candidate.metrics.supportedMoveRatio}%</span>
                  <span>{gradeEstimateLabel(candidate.metrics)}</span>
                  <strong className={candidate.metrics.passed ? "pass" : "review"}>
                    {candidate.metrics.passed ? `规则校验通过 · ${Math.round(candidate.metrics.score)}` : `求解未完全通过 · ${Math.round(candidate.metrics.score)}`}
                  </strong>
                </div>
                <div className="candidate-grade-note">{candidate.metrics.checks.gradeFit === false ? "与目标难度偏差较大，需调整后再试爬。" : "难度为未校准粗估，不等于实测等级；试爬反馈可用于后续校准。"}</div>
                {candidate.metrics.issues.length > 0 && (
                  <div className="candidate-issues">{candidate.metrics.issues[0]}</div>
                )}
                <Button size="sm" onClick={() => requestCandidate(candidate)} disabled={routeMode === 'tianyu' && tianyuRouteBusy}>
                  {routeMode === 'tianyu' ? '采用并编辑线路' : activeCandidateId === candidate.id
                    ? routeMode !== "free" ? "已在固定板上显示" : "已采用，可继续调整"
                    : routeMode !== "free" ? "在固定板上显示" : "采用此方案"}
                </Button>
              </article>
            ))}
          </div>
          {routeMode === 'tianyu' && <details ref={boardMaintenanceRef} id="tianyu-board-maintenance" className="tianyu-board-maintenance"
            open={boardMaintenanceOpen} onToggle={event => { const open = event.currentTarget.open; setBoardMaintenanceOpen(open); if (!open) { setTianyuAnnotating(false); setTianyuImageMode('photo'); } }}>
            <summary>点位图维护 · 平时无需展开</summary>
            {libraryPanel}
          </details>}
        </aside>
  );
  const manualPanel = <aside id="tianyu-manual-panel" className="tool-panel manual-panel" aria-label="人工定线">
    <TianyuRouteEditor
      editor={tianyuEditor} holds={tianyuHolds} angle={tianyuAngle} boardRevision={tianyuReviewRevision}
      selectedHoldId={selectedTianyuId} disabled={tianyuLoading || isGenerating}
      onSelect={setSelectedTianyuId} onOpen={openTianyuRoute} onBusyChange={setTianyuRouteBusy}
      onChange={state => { setTianyuEditor(state); if (!state) updateModeSession('tianyu', { activeCandidateId: null, manualReviewRequired: true }); }}
    />
  </aside>;

  const floorWallPanel = <section className="wall-stage floor-wall-stage" aria-label="天宇一楼三维定线工作区">
    <div className="wall-toolbar"><div><span className="eyebrow dark">自由定线 · 设计图重建</span><h2>天宇一楼 · 3D 墙面</h2></div>
      <div className="wall-actions"><span>{freePlacements.length} 个已安装岩点</span><Button variant="outline" size="sm" disabled={!freePlacements.length || isGenerating} onClick={()=>setClearDialogOpen(true)}>清空</Button></div>
    </div>
    <FloorWallEditor holds={payload?.holds??[]} placements={freePlacements} selectedId={selectedId} faceId={floorFaceId} pendingHold={pendingFloorHold}
      storageKey={floorStorageKey} busy={isGenerating} onSelect={setSelectedId} onFace={setFloorFaceId} onCancelPlace={()=>setPendingFloorHold(null)}
      onPlace={placeFloorHold} onUpdate={updateFloorHold} onRemove={removePlacement}
      onRestore={(placements,faceId)=>{setFreePlacements(placements);setFloorFaceId(faceId);setSelectedId(null);setPendingFloorHold(null);updateModeSession('free',{activeCandidateId:null,manualReviewRequired:true,candidates:[]});}}/>
    {floorNotice && <p className="floor-wall-notice" role="status">{floorNotice}</p>}
    {manualReviewRequired && <p className="floor-wall-review-note">人工编辑草稿 · 原候选评分不再适用，请试爬复核。</p>}
    <details className="floor-installed-list"><summary>已安装岩点 · {freePlacements.length}</summary><div>{freePlacements.map((point,i)=><button type="button" key={point.instanceId} aria-pressed={selectedId===point.instanceId} onClick={()=>{setSelectedId(point.instanceId); const face=getFace(point.surfaceId??'F2'); if(face?.kind==='main')setFloorFaceId(face.id);}}>{i+1}. {point.hold.serial} · {point.surfaceId} · {routePointDescription(point)}</button>)}</div></details>
  </section>;

  return (
    <main className={`route-app ${routeMode === 'tianyu' ? 'tianyu-workspace' : routeMode === 'free' ? 'floor-workspace' : ''}`} data-floor-tool={floorTool} data-active-tool={activeTianyuTool} data-tools-collapsed={tianyuToolsCollapsed}>
      {appHeader}
      <section className="workspace-grid">
        {routeMode === 'tianyu' ? <>
          <div className="tianyu-tool-switch" role="group" aria-label="定线工具切换">
            <button type="button" aria-pressed={!tianyuToolsCollapsed && activeTianyuTool === 'ai'} aria-controls="tianyu-ai-panel" onClick={() => { setActiveTianyuTool('ai'); setTianyuToolsCollapsed(false); }}>AI 辅助定线</button>
            <button type="button" aria-pressed={!tianyuToolsCollapsed && activeTianyuTool === 'manual'} aria-controls="tianyu-manual-panel" onClick={() => { setActiveTianyuTool('manual'); setTianyuToolsCollapsed(false); }}>人工定线</button>
            <button type="button" aria-pressed={tianyuToolsCollapsed} onClick={() => setTianyuToolsCollapsed(value => !value)}>完整看板</button>
          </div>
          {aiPanel}{wallPanel}{manualPanel}
        </> : routeMode === 'free' ? <>
          <div className="floor-tool-switch" role="group" aria-label="三维定线工具">
            <button type="button" aria-pressed={floorTool==='library'} onClick={()=>setFloorTool('library')}>岩点库</button>
            <button type="button" aria-pressed={floorTool==='ai'} onClick={()=>{setFloorTool('ai');setPendingFloorHold(null);}}>AI 辅助定线</button>
            <button type="button" aria-pressed={floorTool==='none'} onClick={()=>setFloorTool(floorTool==='none'?'library':'none')}>完整看墙</button>
          </div>{floorWallPanel}{libraryPanel}{aiPanel}
        </> : <>{libraryPanel}{wallPanel}{aiPanel}</>}
      </section>

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>替换当前墙面方案？</AlertDialogTitle>
            <AlertDialogDescription>采用候选方案会清除当前自由墙面上的 {freePlacements.length} 个岩点。这个操作不会修改岩点库或固定板。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingCandidate && applyCandidate(pendingCandidate)}>替换并采用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{routeMode === "tianyu" ? "清空天宇板点位图？" : routeMode === "fixed" ? "清空固定板？" : "清空当前墙面？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {routeMode === "tianyu"
                ? `当前 ${tianyuHolds.length} 个照片热点将被移除，天宇板候选也会失效。已保存版本仍保留在本机，其他两种定线模式不受影响。`
                : routeMode === "fixed"
                ? `固定板上的 ${placements.length} 个已安装点将被移除，固定板候选也会失效。已保存版本仍会保留，岩点库和自由定线不受影响。`
                : `墙面上的 ${placements.length} 个岩点将被移除，岩点库和固定板不会受影响。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearRoute}>{routeMode === "tianyu" ? "清空点位图" : routeMode === "fixed" ? "清空固定板" : "清空墙面"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreTianyuDialogOpen} onOpenChange={setRestoreTianyuDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复 GPT-6 复核版？</AlertDialogTitle>
            <AlertDialogDescription>
              当前 {tianyuHolds.length} 个点将被替换为 {tianyuAutoSeed.length} 个已确认的 GPT-6 复核点，当前人工修改和已生成候选会失效。浏览器中上次保存的版本不会改变，直到你再次点击“保存天宇板”。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={restoreTianyuAutoSeed}>恢复复核版</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={randomBoardDialogOpen} onOpenChange={setRandomBoardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>生成一块新的随机固定板？</AlertDialogTitle>
            <AlertDialogDescription>
              当前板面的 {fixedBoardPlacements.length} 个岩点将被替换为一块 {randomFixedBoardHoldCount} 点的随机板。之前已保存的版本不会改变，直到你再次点击“保存固定板”。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={generateRandomFixedBoard}>生成新板</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
