export const tianyuReviewRevision = "gpt6-visual-r1";
export const tianyuBoardStorageKey = "ai-gym.tianyu-board.v2";
export const tianyuBackupStorageKey = "ai-gym.tianyu-board.before-gpt6-r1";

export type TianyuRegistration = {
  revision: string;
  photoAnchor: { x: number; y: number };
  status: "registered" | "uncertain" | "missing";
  reason: string;
  faceIndex?: number;
  barycentric?: [number, number, number];
  surfacePoint?: [number, number, number];
  surfaceNormal?: [number, number, number];
  localCheckP90Px: number | null;
  localCheckCount: number;
  nearestControlPx: number;
  controlCount: number;
  bidirectionalErrorPx?: number;
  patchCheck?: { correlation: number; offsetPx: number; peakMargin: number; windowRadiusPx: number };
};

export type TianyuRegistrationReport = {
  version: 1;
  revision: string;
  counts: { registered: number; uncertain: number; missing: number };
  photoSize: [number, number];
  validation: { matches: number; holdoutCount: number; holdoutErrorPx: { median: number; p95: number } };
  assets: { projection: string; coverage: string; checkPoints: string };
  source: { meshUrl: string };
  points: Record<string, TianyuRegistration>;
};

export type TianyuHold = {
  id: string;
  serial: string;
  x: number;
  y: number;
  radius: number;
  grip: string;
  size: string;
  source: "auto" | "manual" | "reviewed";
  confirmed: boolean;
  confidence?: number;
  color?: string;
  shape?: string;
  usage?: string;
  notes?: string;
  reviewedBy?: string;
  humanEdited?: boolean;
  registration?: TianyuRegistration;
};

export type StoredTianyuBoard = {
  version: 2;
  savedAt: string;
  angle: number;
  reviewRevision?: string;
  holds: TianyuHold[];
};

export type TianyuSeedPayload = {
  version: 2;
  reviewRevision: string;
  holds: TianyuHold[];
  legacyHolds: TianyuHold[];
};

const grips = ["综合", "把手", "开放点", "捏点", "边缘点", "造型"];
const sizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const limit = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function normalizeTianyuHolds(value: unknown): TianyuHold[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) return [];
    if (![item.x, item.y, item.radius].every((v) => typeof v === "number" && Number.isFinite(v))) return [];
    ids.add(item.id);
    const source = item.source === "reviewed" ? "reviewed" : item.source === "auto" ? "auto" : "manual";
    return [{
      id: item.id,
      serial: typeof item.serial === "string" && item.serial.trim() ? item.serial : `TY-${String(index + 1).padStart(3, "0")}`,
      x: limit(item.x, 0, 100), y: limit(item.y, 0, 100), radius: limit(item.radius, 0.8, 5),
      grip: grips.includes(item.grip) ? item.grip : "综合",
      size: sizes.includes(item.size) ? item.size : "M",
      source,
      confirmed: typeof item.confirmed === "boolean" ? item.confirmed : source !== "auto",
      ...(typeof item.confidence === "number" && Number.isFinite(item.confidence) ? { confidence: limit(item.confidence, 0, 1) } : {}),
      ...Object.fromEntries(["color", "shape", "usage", "notes", "reviewedBy"].flatMap((key) => typeof item[key] === "string" ? [[key, item[key].slice(0, 500)]] : [])),
      humanEdited: item.humanEdited === true,
      ...(normalizeTianyuRegistration(item.registration) ? { registration: normalizeTianyuRegistration(item.registration) } : {}),
    } satisfies TianyuHold];
  });
}

function normalizeTianyuRegistration(value: unknown): TianyuRegistration | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as TianyuRegistration;
  if (typeof r.revision !== "string" || !["registered", "uncertain", "missing"].includes(r.status)
    || !r.photoAnchor || ![r.photoAnchor.x, r.photoAnchor.y].every(Number.isFinite)
    || ![r.localCheckCount, r.nearestControlPx, r.controlCount].every((n) => Number.isFinite(n) && n >= 0)
    || (r.localCheckP90Px !== null && (!Number.isFinite(r.localCheckP90Px) || r.localCheckP90Px < 0))) return undefined;
  const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  const hasSurface = vector(r.surfacePoint) && vector(r.surfaceNormal) && vector(r.barycentric)
    && r.barycentric.every((n) => n >= -0.000001 && n <= 1.000001)
    && Math.abs(r.barycentric.reduce((sum, n) => sum + n, 0) - 1) < 0.00001
    && Number.isInteger(r.faceIndex) && r.faceIndex! >= 0;
  if (r.status === "registered" && !hasSurface) return undefined;
  return {
    revision: r.revision, status: r.status, photoAnchor: { ...r.photoAnchor },
    reason: typeof r.reason === "string" ? r.reason.slice(0, 500) : "",
    localCheckP90Px: r.localCheckP90Px, localCheckCount: r.localCheckCount,
    nearestControlPx: r.nearestControlPx, controlCount: r.controlCount,
    ...(typeof r.bidirectionalErrorPx === "number" && Number.isFinite(r.bidirectionalErrorPx) && r.bidirectionalErrorPx >= 0 ? { bidirectionalErrorPx: r.bidirectionalErrorPx } : {}),
    ...(r.patchCheck && [r.patchCheck.correlation, r.patchCheck.offsetPx, r.patchCheck.peakMargin, r.patchCheck.windowRadiusPx].every(Number.isFinite) ? { patchCheck: { ...r.patchCheck } } : {}),
    ...(hasSurface && r.status !== "missing" ? { faceIndex: r.faceIndex, surfacePoint: [...r.surfacePoint!] as [number, number, number], surfaceNormal: [...r.surfaceNormal!] as [number, number, number], barycentric: [...r.barycentric!] as [number, number, number] } : {}),
  };
}

/** Enrich known IDs without moving points, resurrecting deletions or adding holds. */
export function attachTianyuRegistration(holds: TianyuHold[], report: TianyuRegistrationReport): TianyuHold[] {
  return holds.map((hold) => {
    const registration = normalizeTianyuRegistration(report.points[hold.id]);
    // Keep the original photo anchor. A manual move must NOT relabel an old 3D
    // surface coordinate as a newly verified association.
    return registration ? { ...hold, registration } : hold;
  });
}

export function tianyuRegistrationStatus(point: TianyuHold): TianyuRegistration["status"] | "moved" | "unregistered" {
  const r = point.registration;
  if (!r) return "unregistered";
  if (Math.abs(point.x - r.photoAnchor.x) > 0.00001 || Math.abs(point.y - r.photoAnchor.y) > 0.00001) return "moved";
  return r.status;
}

export const tianyuRegistrationLabels = {
  registered: "表面已配准", uncertain: "表面关联待复核", missing: "扫描未覆盖", moved: "点位已移动 · 三维关联失效", unregistered: "尚无三维关联",
};

export function tianyuRegistrationDescription(point: TianyuHold): string {
  const status = tianyuRegistrationStatus(point);
  if (status === "registered") return "照片与GLB表面已配准，含局部图像畸变校正；不是整颗岩点分割或实物抓深测量";
  if (status === "uncertain") return "照片与GLB有表面关联，但局部几何依据不足，待复核";
  if (status === "missing") return "照片点位已确认；原始GLB没有覆盖该点，无三维几何依据";
  if (status === "moved") return "人工移动后的照片点位；原三维配准已失效，不使用旧三维坐标";
  return "仅照片点位，尚无逐点三维关联";
}

/** Merge the reviewed baseline once, preserving previous manual moves, edits and deletions. */
export function mergeTianyuReview(saved: TianyuHold[], legacy: TianyuHold[], reviewed: TianyuHold[]): TianyuHold[] {
  // No saved board is handled by the caller. An existing empty board is an
  // intentional clear, so neither old candidates nor new review points return.
  if (saved.length === 0) return [];
  const oldById = new Map(legacy.map((hold) => [hold.id, hold]));
  const savedById = new Map(saved.map((hold) => [hold.id, hold]));
  const reviewedById = new Map(reviewed.map((hold) => [hold.id, hold]));
  const editableFields = ["serial", "x", "y", "radius", "grip", "size", "color", "shape", "usage", "notes"] as const;
  const changedFields = (hold: TianyuHold, original: TianyuHold) => editableFields.filter((key) => hold[key] !== original[key]);
  const edited = (hold: TianyuHold, original?: TianyuHold) => !original || hold.source === "manual" || hold.humanEdited
    || changedFields(hold, original).length > 0;
  const merged = reviewed.flatMap((hold) => {
    const original = oldById.get(hold.id);
    const local = savedById.get(hold.id);
    // A missing old candidate is a user's deletion; do not reinsert it.
    if (original && !local) return [];
    if (local && edited(local, original)) {
      // Preserve the fields a person actually changed, while allowing reviewed
      // geometry and descriptive metadata to replace untouched old defaults.
      const changes = original && local.source !== "manual"
        ? Object.fromEntries(changedFields(local, original).map((key) => [key, local[key]]))
        : local;
      return [{ ...hold, ...changes, source: "manual" as const, humanEdited: true, reviewedBy: "人工调整", confirmed: true }];
    }
    return [{ ...hold, confirmed: true }];
  });
  for (const hold of saved) {
    if (reviewedById.has(hold.id) || !edited(hold, oldById.get(hold.id))) continue;
    merged.push({ ...hold, source: "manual", humanEdited: true, reviewedBy: "人工调整", confirmed: true });
  }
  return merged;
}

export function tianyuAssetDescription(point: TianyuHold): string {
  const basis = point.humanEdited || point.source === "manual" ? "人工调整点位" : point.source === "reviewed" ? "GPT-6 已视觉复核点位" : "视觉初标";
  return [basis, point.color && `颜色：${point.color}`, point.shape && `外形：${point.shape}`,
    point.usage && `用途建议：${point.usage}`, point.notes,
    tianyuRegistrationDescription(point),
    "抓握类型、尺寸与用途为视觉估计；深度、摩擦和受力方向未实测"]
    .filter(Boolean).join("；");
}
