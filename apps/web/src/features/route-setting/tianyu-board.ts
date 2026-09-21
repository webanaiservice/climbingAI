export const tianyuReviewRevision = "gpt6-visual-r1";
export const tianyuBoardStorageKey = "ai-gym.tianyu-board.v2";
export const tianyuBackupStorageKey = "ai-gym.tianyu-board.before-gpt6-r1";

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
    } satisfies TianyuHold];
  });
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
    "抓握类型、尺寸与用途为视觉估计；深度、摩擦和受力方向未实测"]
    .filter(Boolean).join("；");
}
