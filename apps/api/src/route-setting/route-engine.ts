export type PlacementRole = "start" | "move" | "foot" | "finish";
export type HandSide = "left" | "right" | "both";
export type RouteStyle = "技术" | "力量" | "动态" | "平衡" | "耐力";
export type PointCountMode = "auto" | "exact" | "max" | "min" | "range" | "around";

export type HoldAsset = {
  id: string;
  serial: string;
  grip: string;
  size: string;
  material: string;
  dimensions: string;
  productType?: string;
  description?: string;
};

export type AiMove = {
  hand: "left" | "right" | "either";
  direction: "up-left" | "up" | "up-right" | "left" | "right" | "match";
  amplitude: "short" | "medium" | "long";
  technique: "static" | "side-pull" | "cross" | "match" | "high-step" | "flag" | "dynamic";
  preferredGrip: string;
};

export type AiPlan = {
  title: string;
  subtitle: string;
  focus: string;
  moves: AiMove[];
};

export type RouteConstraints = {
  grade: number;
  targetActions: number;
  actionCountExplicit: boolean;
  pointCountMode: PointCountMode;
  targetTotalHolds: number;
  minTotalHolds: number;
  maxTotalHolds: number;
  maxTotalHoldsExplicit: boolean;
  style: RouteStyle;
  traverse: boolean;
  farFinish: boolean;
  /** 0° 为直壁，60° 为最大仰角；仅固定板模式设置。 */
  wallAngleDegrees?: number;
  startPointCount?: 3 | 4;
};

export type ResolvedPlacement = {
  instanceId?: string;
  holdId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  role: PlacementRole;
  step: number;
  hand?: HandSide;
  technique?: string;
  roles?: PlacementRole[];
  startLimbs?: Array<"LH" | "RH" | "LF" | "RF">;
};

export type FixedBoardPlacement = {
  instanceId: string;
  holdId: string;
  x: number;
  y: number;
  rotation: number;
};

export type BetaStep = {
  step: number;
  hand: "left" | "right";
  moveCm: number;
  handSpanCm: number;
  supported: boolean;
  technique: string;
  targetInstanceId?: string;
  supportInstanceIds?: string[];
  /** Free mode has no installed instance IDs until the candidate is applied. */
  supportHoldIds?: string[];
};

export type CandidateMetrics = {
  totalCount: number;
  handCount: number;
  footCount: number;
  moveCount: number;
  maxSpanCm: number;
  maxMoveCm: number;
  supportedMoveRatio: number;
  estimatedGrade: number;
  cruxGrade: number;
  startHoldCount: number;
  startHandCount: number;
  startFootCount: number;
  gradeRange?: [number, number];
  gradeConfidence?: "low" | "medium";
  gradeDeviation?: number;
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
    boardIntegrity?: boolean;
    startStance: boolean;
    gradeFit: boolean;
  };
  beta: BetaStep[];
  issues: string[];
};

export type FinalCandidate = {
  title: string;
  subtitle: string;
  grade: string;
  reach: string;
  focus: string;
  placements: ResolvedPlacement[];
  metrics: CandidateMetrics;
};

type PlacementDraft = Omit<ResolvedPlacement, "holdId" | "scale"> & { desiredGrip: string };
type PointSpec = { mode: PointCountMode; min?: number; max?: number; target?: number; raw?: number };
type HandState = { left: { x: number; y: number }; right: { x: number; y: number } };

const holdSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number) {
  return clamp(Math.round(value / 5) * 5, 5, 95);
}

function distanceCm(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y) * 4;
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeRoutePrompt(prompt: string) {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  return prompt.normalize("NFKC").replace(
    /[零〇一二两三四五六七八九十百]+(?=个|颗|枚|点|岩点|安装点|步|动作|手|脚|度|或|至|到|[-~～—–/]|[,，。;；]|$)/g,
    (word) => {
      let total = 0;
      let digit = 0;
      for (const char of word) {
        if (char === "十" || char === "百") { total += (digit || 1) * (char === "十" ? 10 : 100); digit = 0; }
        else digit = digits[char] ?? 0;
      }
      return String(total + digit);
    },
  ).replace(/(?<=\d)\s+(?=\d)/g, "，").replace(/\s+/g, "");
}

const startBefore = /(?:3(?:或|\/|至|到|[-~～—–])4|[34])(?:个)?(?:安装点|岩点|点)起步/g;
const startAfter = /起步(?:点(?:数量|数)?|点位数|点位|采用|使用)?(?:控制在|采用|使用|设为|为|用|是|:|=)*(?:3(?:或|\/|至|到|[-~～—–])4|[34])(?:个)?(?:安装点|岩点|点)?/g;

function startingLimbComposition(text: string) {
  const hands: number[] = [];
  const feet: number[] = [];
  const quantity = "[12](?:(?:或|/|至|到|[-~～—–])[12])?";
  const forward = new RegExp(`(?<![\\d.])(${quantity})(?:个)?(?:独立)?(手点?|脚点?)(?!动作|数)`, "g");
  const reverse = new RegExp(`(手点|脚点)(?:数量|数)?(?:为|用|是|:|=)?(${quantity})(?!\\d)(?:个)?`, "g");
  const collect = (quantityText: string, limb: string) => {
    const values = quantityText.split(/或|\/|至|到|[-~～—–]/).map(Number);
    (limb.startsWith("手") ? hands : feet).push(...values);
  };
  // Remove only limb-composition tokens in a starting clause. In particular,
  // keep a separate "9步" / "9手动作" even when it shares that clause.
  const actionText = text.split(/[,，。;；!！\n]/).map((clause) => {
    if (!clause.includes("起步")) return clause;
    return clause.replace(forward, (_match, number: string, limb: string) => {
      collect(number, limb);
      return "";
    }).replace(reverse, (_match, limb: string, number: string) => {
      collect(number, limb);
      return "";
    });
  }).join("，");
  // A 1–2 hand range is intentionally flexible, not a request for two hands.
  const handCount = hands.length && hands.every((count) => count === hands[0]) ? hands[0] : undefined;
  const footCount = feet.length && feet.every((count) => count === feet[0]) ? feet[0] : undefined;
  return { actionText, handCount, footCount, hasFeet: feet.length > 0 };
}

function parseStartPointCount(text: string): 3 | 4 | undefined {
  const phrases = [...text.matchAll(startBefore), ...text.matchAll(startAfter)].map((match) => match[0]);
  const explicit = phrases.find((phrase) => !/3(?:或|\/|至|到|[-~～—–])4/.test(phrase));
  if (explicit) return explicit.includes("3") ? 3 : 4;
  const composition = startingLimbComposition(text);
  if ((!composition.hasFeet || composition.footCount === 2) && composition.handCount) {
    return composition.handCount === 1 ? 3 : 4;
  }
  return undefined;
}

function parseStyle(prompt: string): RouteStyle {
  if (prompt.includes("力量")) return "力量";
  if (prompt.includes("动态") || prompt.includes("协调")) return "动态";
  if (prompt.includes("平衡")) return "平衡";
  if (prompt.includes("耐力")) return "耐力";
  return "技术";
}

function parsePointCount(prompt: string): PointSpec {
  // Parse point quantities within their own clause. Never borrow an angle,
  // wall dimension, grade, action count or a "3点起步" number as total holds.
  const text = prompt.replace(startBefore, "").replace(startAfter, "");
  const noun = "(?:总安装点(?:数量|数)?|总岩点(?:数量|数)?|线路用点(?:数量|数)?|线路点(?:位|数)|点位(?:数量|数)?|安装点(?:数量|数)?|用点(?:数量|数)?|岩点(?:数量|数)?|总点数|点数)";
  const modifiers = "(?:严格|恰好|正好|必须|只能|只|不(?:要)?超过|不能超过|不得超过|不得多于|不多于|不大于|不少于|不低于|最多|至多|至少|最少|上限|下限|控制在|控制为|限定为|固定为|固定|设为|大约|大概|大致|差不多|约|尽量|使用|用|为|是|:|=|≤|>=|<=|≥)*";
  const quantity = "(\\d{1,3})(?!\\d)(?:([-~～—–至到])(\\d{1,3})(?!\\d))?";
  const trailing = "(?:以内|以下|以上|左右|上下)?";
  const patterns = [
    new RegExp(`(${modifiers})${noun}(${modifiers})${quantity}(?:个|颗|枚)?(?:安装点|岩点|点)?(${trailing})(?![\\d.米度手步]|cm|mm)`, "g"),
    new RegExp(`(${modifiers})()(?<![\\d.])${quantity}(?:个|颗|枚)?(?:安装点|岩点|点)(${trailing})(?!起步)`, "g"),
  ];
  const specs: PointSpec[] = [];
  for (const clause of text.split(/[,，。;；!！\n]/)) {
    if (/(?:点数|用点|岩点数|安装点数)(?:不限|不限制|无要求|随动作|按需)/.test(clause)) continue;
    for (const pattern of patterns) for (const match of clause.matchAll(pattern)) {
      const number = Number(match[3]);
      const qualification = `${match[1]}${match[2]}${match[6]}`;
      if (match[4]) { specs.push({ mode: "range", min: Math.min(number, Number(match[5])), max: Math.max(number, Number(match[5])) }); continue; }
      if (/不(?:要)?超过|不能超过|不得超过|不得多于|不多于|不大于|最多|至多|上限|≤|<=|以内|以下/.test(qualification)) specs.push({ mode: "max", max: number, target: number, raw: number });
      else if (/不少于|不低于|至少|最少|下限|≥|>=|以上/.test(qualification)) specs.push({ mode: "min", min: number, target: number, raw: number });
      else if (/恰好|正好|必须|只能|只|固定|严格|限定为|=/.test(qualification)) specs.push({ mode: "exact", min: number, max: number, target: number, raw: number });
      else specs.push({ mode: "around", target: number, raw: number });
    }
  }
  const hard = specs.filter((spec) => spec.mode !== "around");
  if (!hard.length) return specs[0] ?? { mode: "auto" };
  const lower = Math.max(0, ...hard.map((spec) => spec.min ?? 0));
  const upper = Math.min(Infinity, ...hard.map((spec) => spec.max ?? Infinity));
  // Preserve contradictory bounds for an explicit API error, not an arbitrary
  // winner. Multiple maxima/minima intersect instead of silently discarding one.
  if (lower > upper) return { mode: "range", min: lower, max: upper };
  if (hard.some((spec) => spec.mode === "exact")) return { mode: "exact", min: lower, max: lower, target: lower, raw: lower };
  if (lower > 0 && upper < Infinity) return { mode: "range", min: lower, max: upper };
  if (upper < Infinity) return { mode: "max", max: upper, target: upper, raw: upper };
  return { mode: "min", min: lower, target: lower, raw: lower };
}

export function parseRouteConstraints(prompt: string) {
  const text = normalizeRoutePrompt(prompt);
  const grade = clamp(Number(text.match(/V(\d{1,2})/i)?.[1] ?? 4), 0, 10);
  const style = parseStyle(text);
  const actionMatch = startingLimbComposition(text).actionText.match(/(\d{1,2})(?:个)?(?:动作|手数|手(?!点)|步)/);
  const explicitActions = actionMatch ? Number(actionMatch[1]) : null;
  const point = parsePointCount(text);
  const startPointCount = parseStartPointCount(text);
  const traverse = /横移|横向|侧向/.test(text);
  const baseAuto = style === "耐力" ? 14 : traverse ? 12 : style === "力量" || style === "动态" ? 10 : 11;
  const autoTarget = clamp(explicitActions === null ? baseAuto : explicitActions + 2 + clamp(Math.round(explicitActions * 0.45), 2, 5), 5, 24);
  let targetTotalHolds = autoTarget;
  let minTotalHolds = (startPointCount ?? 3) + 2;
  let maxTotalHolds = 24;

  if (point.mode === "exact") {
    targetTotalHolds = point.target ?? autoTarget;
    minTotalHolds = targetTotalHolds;
    maxTotalHolds = targetTotalHolds;
  } else if (point.mode === "max") {
    maxTotalHolds = point.max ?? autoTarget;
    targetTotalHolds = Math.min(autoTarget, maxTotalHolds);
    minTotalHolds = Math.min(minTotalHolds, maxTotalHolds);
  } else if (point.mode === "min") {
    minTotalHolds = point.min ?? autoTarget;
    targetTotalHolds = Math.max(autoTarget, minTotalHolds);
    maxTotalHolds = Math.max(minTotalHolds, 24);
  } else if (point.mode === "range") {
    minTotalHolds = point.min ?? 5;
    maxTotalHolds = point.max ?? 24;
    targetTotalHolds = Math.round((minTotalHolds + maxTotalHolds) / 2);
  } else if (point.mode === "around") {
    targetTotalHolds = point.target ?? autoTarget;
    minTotalHolds = Math.max(1, targetTotalHolds - 1);
    maxTotalHolds = targetTotalHolds + 1;
  }

  const feet = targetTotalHolds >= 12 ? 4 : targetTotalHolds >= 9 ? (traverse ? 2 : 3) : targetTotalHolds >= 6 ? 2 : 1;
  const targetActions = clamp(explicitActions ?? Math.max(2, targetTotalHolds - feet - 2), 2, 18);
  const warnings: string[] = [];
  if (point.mode === "around") warnings.push(`点数按约 ${targetTotalHolds} 个理解（${minTotalHolds}–${maxTotalHolds} 个独立安装点），优先难度和动作质量，不为凑满而加点；需要严格数量请写“恰好”或“最多”。`);
  if (explicitActions !== null && targetActions + 2 >= maxTotalHolds) warnings.push("动作数与安装点预算冲突，求解器会优先满足提示词中的总安装点规则。");
  return {
    constraints: {
      grade,
      targetActions,
      actionCountExplicit: explicitActions !== null,
      pointCountMode: point.mode,
      targetTotalHolds,
      minTotalHolds,
      maxTotalHolds,
      maxTotalHoldsExplicit: !["auto", "around"].includes(point.mode),
      style,
      traverse,
      farFinish: /远.{0,3}(终结|结束|顶)|大跨|长距离/.test(text),
      ...(startPointCount ? { startPointCount } : {}),
    } satisfies RouteConstraints,
    warnings,
  };
}

function preferredGrips(style: RouteStyle, grade: number) {
  if (grade <= 2) return ["把手", "开放点", "综合", "边缘点", "捏点"];
  if (style === "力量") return ["捏点", "开放点", "把手", "边缘点", "综合"];
  if (style === "动态") return ["把手", "开放点", "综合", "边缘点", "捏点"];
  if (style === "平衡") return ["边缘点", "捏点", "开放点", "综合", "把手"];
  return ["边缘点", "开放点", "捏点", "把手", "综合"];
}

export function allocationFor(constraints: RouteConstraints, variant = 0) {
  const totalCount = constraints.targetTotalHolds;
  const startCount = (constraints.startPointCount ?? (variant % 2 ? 4 : 3)) - 2;
  const startFootCount = 2;
  let footCount = Math.max(startFootCount, totalCount >= 12 ? 4 : totalCount >= 9 ? 3 : 2);
  let handCount = totalCount - footCount;
  if (constraints.actionCountExplicit) {
    handCount = clamp(constraints.targetActions + startCount, startCount + 2, totalCount - startFootCount);
    footCount = totalCount - handCount;
  }
  if (handCount < startCount + 2 && totalCount >= startCount + startFootCount + 2) {
    handCount = startCount + 2;
    footCount = totalCount - handCount;
  }
  return { totalCount, handCount, footCount, startCount, startFootCount, actionCount: Math.max(2, handCount - startCount) };
}

export function fallbackPlans(constraints: RouteConstraints): AiPlan[] {
  const grips = preferredGrips(constraints.style, constraints.grade);
  const actionCount = allocationFor(constraints).actionCount;
  const patterns = [
    { title: "交替折线", subtitle: "左右手交替推进，用侧拉和换重心建立稳定节奏。", focus: `${constraints.style} / 重心转移`, directions: ["up-left", "up-right", "up", "up-right"] as AiMove["direction"][], technique: "static" as AiMove["technique"] },
    { title: "压缩直上", subtitle: "手点保持在身体两侧，以核心收紧和高脚持续上升。", focus: `${constraints.style} / 核心`, directions: ["up-right", "up-left", "up", "up-left"] as AiMove["direction"][], technique: "high-step" as AiMove["technique"] },
    { title: "横移收束", subtitle: "先建立横向节奏，再用一段明确的上升序列完成终结。", focus: `${constraints.style} / 横移`, directions: ["right", "right", "up-left", "up-right", "up"] as AiMove["direction"][], technique: (constraints.style === "动态" ? "dynamic" : "side-pull") as AiMove["technique"] },
    { title: "旗式回摆", subtitle: "通过旗式控制髋部位置，在交替手序中改变发力方向。", focus: `${constraints.style} / 旗式`, directions: ["up-left", "up", "up-right", "up-left"] as AiMove["direction"][], technique: "flag" as AiMove["technique"] },
    { title: "交叉过渡", subtitle: "以一次可读的交叉动作作为核心，再回到稳定交替节奏。", focus: `${constraints.style} / 交叉`, directions: ["up-right", "left", "up-left", "up-right"] as AiMove["direction"][], technique: "cross" as AiMove["technique"] },
  ];
  return patterns.map((pattern, planIndex) => ({
    title: pattern.title,
    subtitle: pattern.subtitle,
    focus: pattern.focus,
    moves: Array.from({ length: actionCount }, (_, index) => ({
      hand: index % 2 === 0 ? "right" : "left",
      direction: pattern.directions[index % pattern.directions.length],
      amplitude: constraints.grade >= 6 && index % 3 === 1 ? "long" : constraints.grade <= 2 ? "short" : "medium",
      technique: index === Math.floor(actionCount / 2) ? pattern.technique : "static",
      preferredGrip: grips[(index + planIndex) % grips.length],
    })),
  }));
}

function normalizePlan(plan: AiPlan, constraints: RouteConstraints, variant: number) {
  const count = allocationFor(constraints, variant).actionCount;
  const fallback = fallbackPlans(constraints)[variant % 5];
  return { ...plan, moves: Array.from({ length: count }, (_, index) => plan.moves[index] ?? fallback.moves[index % fallback.moves.length]) };
}

function sideForMove(move: AiMove, index: number, previous: "left" | "right" | null) {
  const proposed = move.hand === "either" ? (index % 2 === 0 ? "right" : "left") : move.hand;
  return previous === proposed && !["match", "cross"].includes(move.technique)
    ? proposed === "left" ? "right" : "left"
    : proposed;
}

function pathX(variant: number, progress: number, side: "left" | "right", move: AiMove) {
  const offset = side === "left" ? -5 : 5;
  let x = variant % 3 === 0
    ? 50 + Math.sin(progress * Math.PI * 2.25) * 11 + offset
    : variant % 3 === 1
      ? 50 + offset * 1.55 + Math.sin(progress * Math.PI) * 4
      : 23 + progress * 54 + offset * 0.7;
  const amplitude = move.amplitude === "long" ? 14 : move.amplitude === "short" ? 5 : 9;
  if (move.direction === "left" || move.direction === "up-left") x -= amplitude * 0.45;
  if (move.direction === "right" || move.direction === "up-right") x += amplitude * 0.45;
  if (move.direction === "match") x -= offset;
  return x;
}

function pathY(constraints: RouteConstraints, progress: number) {
  const adjusted = constraints.traverse
    ? progress <= 0.55 ? progress * 0.52 : 0.286 + ((progress - 0.55) / 0.45) * 0.714
    : progress;
  return 78 - adjusted * 68;
}

function constrainTarget(proposed: { x: number; y: number }, moving: { x: number; y: number }, remaining: { x: number; y: number }, constraints: RouteConstraints, move: AiMove) {
  const limitCm = constraints.grade <= 2 ? 110 : constraints.grade <= 5 ? 130 : constraints.grade <= 7 ? 145 : 160;
  const moveLimit = (limitCm + (move.technique === "dynamic" ? 20 : 0)) / 4;
  const spanLimit = (limitCm + 15) / 4;
  let target = { x: clamp(proposed.x, 8, 92), y: clamp(proposed.y, 8, 90) };
  const travel = Math.hypot(target.x - moving.x, target.y - moving.y);
  if (travel > moveLimit) {
    const ratio = moveLimit / travel;
    target = { x: moving.x + (target.x - moving.x) * ratio, y: moving.y + (target.y - moving.y) * ratio };
  }
  const span = Math.hypot(target.x - remaining.x, target.y - remaining.y);
  if (span > spanLimit) {
    const ratio = spanLimit / span;
    target = { x: remaining.x + (target.x - remaining.x) * ratio, y: remaining.y + (target.y - remaining.y) * ratio };
  }
  return { x: snap(target.x), y: snap(target.y) };
}

function chooseHold(holds: HoldAsset[], used: Set<string>, draft: PlacementDraft, constraints: RouteConstraints, occupied: ResolvedPlacement[] = []) {
  const targetSize = draft.role === "foot" ? "L" : constraints.grade >= 5 ? "L" : "XL";
  const targetIndex = holdSizes.indexOf(targetSize);
  const gripOrder = preferredGrips(constraints.style, constraints.grade);
  const selected = holds.filter((hold) => !used.has(hold.id)).map((hold) => {
    const sizeIndex = holdSizes.indexOf(hold.size as typeof holdSizes[number]);
    const size = sizeIndex < 0 ? 4 : sizeIndex;
    const gripRank = gripOrder.indexOf(hold.grip);
    let score = (hold.grip === draft.desiredGrip ? 90 : gripRank < 0 ? 0 : 40 - gripRank * 6) - Math.abs(size - targetIndex) * 9;
    const uncertain = /遮挡|未标注/.test(`${hold.description ?? ""}${hold.productType ?? ""}`);
    const shape = hold.grip === "造型";
    if (draft.role === "foot") {
      score += hold.grip === "边缘点" ? 34 : ["开放点", "捏点"].includes(hold.grip) ? 18 : 0;
      score += (6 - size) * 12;
      if (uncertain) score -= 70;
      if (shape) score -= 100;
    } else if (shape) score -= 45;
    if (["start", "finish"].includes(draft.role) && constraints.grade <= 3 && ["把手", "开放点"].includes(hold.grip)) score += 32;
    for (const placement of occupied) {
      const other = holds.find((asset) => asset.id === placement.holdId);
      const gap = Math.hypot(placement.x - draft.x, placement.y - draft.y);
      if (gap < (footprintRadius(hold) + footprintRadius(other)) * 0.82) score -= 200;
    }
    return { hold, score };
  }).sort((a, b) => b.score - a.score || a.hold.id.localeCompare(b.hold.id))[0]?.hold;
  if (!selected) throw new Error("没有足够的独立岩点完成方案");
  used.add(selected.id);
  return selected;
}

function buildDraft(plan: AiPlan, constraints: RouteConstraints, variant: number, attempt: number) {
  const normalized = normalizePlan(plan, constraints, variant);
  const allocation = allocationFor(constraints, variant);
  const random = seededRandom(hashText(`${plan.title}-${variant}-${attempt}`));
  const drafts: PlacementDraft[] = [];
  const baseX = variant % 3 === 2 ? 34 : 50;
  const left = { x: snap(baseX - (allocation.startCount === 1 ? 0 : 8)), y: 80 };
  const right = allocation.startCount === 1 ? left : { x: snap(baseX + 8), y: variant % 2 ? 75 : 80 };
  let state: HandState = { left, right };
  drafts.push({ ...left, rotation: -10, role: "start", step: 0, hand: allocation.startCount === 1 ? "both" : "left", startLimbs: allocation.startCount === 1 ? ["LH", "RH"] : ["LH"], technique: "static", desiredGrip: "把手" });
  if (allocation.startCount === 2) drafts.push({ ...right, rotation: 10, role: "start", step: 0, hand: "right", startLimbs: ["RH"], technique: "static", desiredGrip: "把手" });
  for (let index = 0; index < allocation.startFootCount; index += 1) {
    drafts.push({ x: snap(baseX + (index === 0 ? -7 : 7)), y: 95, rotation: index ? 15 : -15, role: "foot", step: 0,
      startLimbs: [index ? "RF" : "LF"], technique: "support", desiredGrip: "边缘点" });
  }
  const states: HandState[] = [{ left: { ...state.left }, right: { ...state.right } }];
  let previous: "left" | "right" | null = null;
  normalized.moves.forEach((move, index) => {
    const side = sideForMove(move, index, previous);
    const other = side === "left" ? "right" : "left";
    const progress = (index + 1) / normalized.moves.length;
    const jitter = attempt === 0 ? 0 : (random() - 0.5) * Math.min(6, attempt * 2.5);
    const target = constrainTarget({ x: pathX(variant, progress, side, move) + jitter, y: pathY(constraints, progress) }, state[side], state[other], constraints, move);
    const role: PlacementRole = index === normalized.moves.length - 1 ? "finish" : "move";
    drafts.push({ ...target, rotation: side === "left" ? -15 : 15, role, step: index + 1, hand: side, technique: move.technique, desiredGrip: role === "finish" && constraints.grade <= 3 ? "把手" : move.preferredGrip });
    state = { ...state, [side]: target };
    states.push({ left: { ...state.left }, right: { ...state.right } });
    previous = side;
  });
  const lastSupport = Math.max(0, states.length - 2);
  const laterFootCount = allocation.footCount - allocation.startFootCount;
  for (let index = 0; index < laterFootCount; index += 1) {
    const stateIndex = Math.round(((index + 1) / Math.max(1, laterFootCount)) * lastSupport);
    const support = states[stateIndex];
    const bodyX = (support.left.x + support.right.x) / 2;
    const baseY = snap(Math.min(95, Math.max(support.left.y, support.right.y) + 20));
    const candidates = [-20, 20, -15, 15, -10, 10, -5, 5, 0].flatMap((offset) => [
      { x: snap(bodyX + offset), y: baseY },
      { x: snap(bodyX + offset), y: snap(Math.min(95, baseY + 5)) },
    ]);
    const foot = candidates.sort((a, b) => {
      const clearance = (point: { x: number; y: number }) => Math.min(...drafts.map((draft) => Math.hypot(point.x - draft.x, point.y - draft.y)));
      const scoreA = clearance(a) - Math.abs(a.x - bodyX) * 0.08;
      const scoreB = clearance(b) - Math.abs(b.x - bodyX) * 0.08;
      return scoreB - scoreA;
    })[0];
    drafts.push({
      x: foot.x,
      y: foot.y,
      rotation: index % 2 === 0 ? -20 : 20,
      role: "foot",
      step: index + 1,
      technique: "support",
      desiredGrip: "边缘点",
    });
  }
  return drafts;
}

function materialize(drafts: PlacementDraft[], holds: HoldAsset[], constraints: RouteConstraints) {
  const used = new Set<string>();
  const placements: ResolvedPlacement[] = [];
  for (const draft of drafts) {
    const hold = chooseHold(holds, used, draft, constraints, placements);
    const { desiredGrip: _ignored, ...placement } = draft;
    void _ignored;
    placements.push({ ...placement, holdId: hold.id, scale: 1 });
  }
  return placements;
}

function countPass(count: number, constraints: RouteConstraints) {
  if (constraints.pointCountMode === "exact") return count === constraints.targetTotalHolds;
  if (constraints.pointCountMode === "max") return count <= constraints.maxTotalHolds;
  if (constraints.pointCountMode === "min") return count >= constraints.minTotalHolds;
  return count >= constraints.minTotalHolds && count <= constraints.maxTotalHolds;
}

function footprintRadius(hold?: HoldAsset) {
  const fallback = ({ XS: 1.5, S: 2, M: 2.5, L: 3.1, XL: 4.3, XXL: 5.7, XXXL: 7.2 } as Record<string, number>)[hold?.size ?? ""] ?? 3.5;
  const dimensions = hold?.dimensions ?? "";
  const millimeters = [...dimensions.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map((match) => Number(match[1]) / 10);
  const centimeters = [...dimensions.matchAll(/(\d+(?:\.\d+)?)\s*cm/gi)].map((match) => Number(match[1]));
  let longestCm = Math.max(0, ...millimeters, ...centimeters);
  if (!longestCm && /[×*x]/i.test(dimensions)) {
    const raw = (dimensions.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const longest = Math.max(0, ...raw);
    longestCm = longest > 200 ? longest / 10 : longest;
  }
  if (longestCm < 8 || longestCm > 200) return fallback;
  return clamp(longestCm / 8, fallback * 0.75, 18);
}

function gripDifficulty(grip: string) {
  return ({ 把手: 0.2, 开放点: 0.8, 综合: 0.9, 捏点: 1.2, 边缘点: 1.4, 造型: 0.5 } as Record<string, number>)[grip] ?? 0.8;
}

// Uncalibrated movement proxy, deliberately independent of the requested grade.
// A hold's outer dimensions are not its usable contact area; size has low weight.
function movementDifficulty(moveCm: number, spanCm: number, asset: HoldAsset | undefined, technique: string, angle: number) {
  const size = holdSizes.indexOf(asset?.size as typeof holdSizes[number]);
  const sizeEffort = size < 0 ? 0 : Math.max(0, 3 - size) * 0.18;
  const techniqueEffort = technique === "dynamic" ? 0.65 : technique === "cross" || technique === "high-step" ? 0.25 : 0;
  return clamp(0.6 + gripDifficulty(asset?.grip ?? "") * 1.65 + sizeEffort
    + Math.max(0, moveCm - 55) / 25 + Math.max(0, spanCm - 75) / 95
    + clamp(angle, 0, 60) * 0.04 + techniqueEffort, 0, 10);
}

export function estimateDifficulty(beta: BetaStep[], targetAssets: Array<HoldAsset | undefined>, constraints: RouteConstraints) {
  const difficulties = beta.map((step, index) => movementDifficulty(step.moveCm, step.handSpanCm, targetAssets[index], step.technique, constraints.wallAngleDegrees ?? 0));
  const mean = difficulties.reduce((sum, value) => sum + value, 0) / Math.max(1, difficulties.length);
  const crux = Math.max(0, ...difficulties);
  const cruxGrade = clamp(Math.round(crux), 0, 10);
  const estimatedGrade = clamp(Math.round(crux * 0.65 + mean * 0.35), 0, 10);
  // Without climb feedback and measured grip orientation/depth no V-grade is a calibration.
  const uncertainty = targetAssets.some((asset) => asset?.material === "现场固定板" || !asset?.dimensions) ? 2 : 1;
  return { estimatedGrade, cruxGrade, gradeRange: [Math.max(0, estimatedGrade - uncertainty), Math.min(10, Math.max(estimatedGrade + uncertainty, cruxGrade))] as [number, number],
    gradeConfidence: "low" as const, gradeDeviation: Math.abs(estimatedGrade - constraints.grade) };
}

export function gradeFitsTarget(difficulty: Pick<CandidateMetrics, "estimatedGrade" | "cruxGrade">, targetGrade: number) {
  return Math.abs(difficulty.estimatedGrade - targetGrade) <= 1 && difficulty.cruxGrade <= targetGrade + 1;
}

function startStanceMetrics(placements: ResolvedPlacement[], constraints: RouteConstraints) {
  const starts = placements.filter((placement) => placement.startLimbs?.length);
  const hands = starts.filter((placement) => placement.startLimbs?.some((limb) => limb === "LH" || limb === "RH"));
  const feet = starts.filter((placement) => placement.startLimbs?.some((limb) => limb === "LF" || limb === "RF"));
  const limbs = new Set(starts.flatMap((placement) => placement.startLimbs ?? []));
  const countsValid = constraints.startPointCount ? starts.length === constraints.startPointCount : [3, 4].includes(starts.length);
  const lowerHandY = Math.max(...hands.map((placement) => placement.y));
  const bodyX = hands.reduce((sum, placement) => sum + placement.x, 0) / Math.max(1, hands.length);
  const startStance = countsValid && [1, 2].includes(hands.length) && limbs.has("LH") && limbs.has("RH") && feet.length === 2 && limbs.has("LF") && limbs.has("RF")
    && feet.every((foot) => foot.y >= lowerHandY + 4 && foot.y - lowerHandY <= 35 && Math.abs(foot.x - bodyX) <= 28);
  return { startHoldCount: starts.length, startHandCount: hands.length, startFootCount: feet.length, startStance };
}

function validate(placements: ResolvedPlacement[], constraints: RouteConstraints, holdById: Map<string, HoldAsset>): CandidateMetrics {
  const ids = placements.map((p) => p.holdId);
  const starts = placements.filter((p) => p.role === "start");
  const finish = placements.find((p) => p.role === "finish");
  const feet = placements.filter((p) => p.role === "foot");
  const moves = placements.filter((p) => p.role === "move" || p.role === "finish").sort((a, b) => a.step - b.step);
  const matched = starts.find((p) => p.hand === "both") ?? starts[0];
  const left = starts.find((p) => p.hand === "left") ?? matched;
  const right = starts.find((p) => p.hand === "right") ?? matched;
  let state: HandState | null = left && right ? { left: { x: left.x, y: left.y }, right: { x: right.x, y: right.y } } : null;
  const beta: BetaStep[] = [];
  let previous: "left" | "right" = "left";
  const visited = [...starts];
  if (state) for (const placement of moves) {
    const hand: "left" | "right" = placement.hand === "left" || placement.hand === "right" ? placement.hand : previous === "left" ? "right" : "left";
    const other: "left" | "right" = hand === "left" ? "right" : "left";
    const target = { x: placement.x, y: placement.y };
    const bodyX = (state[other].x + target.x) / 2;
    const lowerHandY = Math.max(state[other].y, target.y);
    const support = [...feet, ...visited]
      .filter((foot) => foot.y >= lowerHandY + 5 && (foot.y - lowerHandY) * 4 <= 150 && Math.abs(foot.x - bodyX) * 4 <= 125)
      .sort((a, b) => {
        const supportCost = (point: ResolvedPlacement) => Math.abs((point.y - lowerHandY) * 4 - 72) + Math.abs(point.x - bodyX) * 1.2;
        return supportCost(a) - supportCost(b);
      })[0];
    beta.push({
      step: placement.step,
      hand,
      moveCm: Math.round(distanceCm(state[hand], target)),
      handSpanCm: Math.round(distanceCm(state[other], target)),
      supported: Boolean(support),
      supportHoldIds: support ? [support.holdId] : [],
      technique: placement.technique ?? "static",
    });
    state = { ...state, [hand]: target };
    visited.push(placement);
    previous = hand;
  }
  const moveLimit = constraints.grade <= 2 ? 110 : constraints.grade <= 5 ? 130 : constraints.grade <= 7 ? 150 : 175;
  const reachFailures = beta.filter((step) => step.moveCm > moveLimit + (step.technique === "dynamic" ? 20 : 0) || step.handSpanCm > moveLimit + 20);
  const supportedMoveRatio = beta.length ? Math.round(beta.filter((step) => step.supported).length / beta.length * 100) : 0;
  let overlaps = 0;
  for (let i = 0; i < placements.length; i += 1) for (let j = i + 1; j < placements.length; j += 1) {
    if (Math.hypot(placements[i].x - placements[j].x, placements[i].y - placements[j].y) < (footprintRadius(holdById.get(placements[i].holdId)) + footprintRadius(holdById.get(placements[j].holdId))) * 0.82) overlaps += 1;
  }
  const startY = starts.length ? starts.reduce((sum, p) => sum + p.y, 0) / starts.length : 0;
  const roles = new Set(placements.map((p) => p.role));
  const stance = startStanceMetrics(placements, constraints);
  const difficulty = estimateDifficulty(beta, moves.map((placement) => holdById.get(placement.holdId)), constraints);
  const usedFootIds = new Set(beta.flatMap((step) => step.supportHoldIds ?? []));
  const unusedFeet = feet.filter((foot) => !foot.startLimbs?.length && !usedFootIds.has(foot.holdId));
  const checks = {
    countRule: countPass(placements.length, constraints),
    uniqueAssets: new Set(ids).size === ids.length,
    requiredRoles: ["start", "move", "foot", "finish"].every((role) => roles.has(role as PlacementRole)),
    startFinish: startY >= 75 && Boolean(finish && finish.y <= 22),
    handReach: beta.length > 0 && reachFailures.length === 0,
    footSupport: beta.length > 0 && supportedMoveRatio === 100 && unusedFeet.length === 0,
    spacing: overlaps === 0,
    startStance: stance.startStance,
    gradeFit: gradeFitsTarget(difficulty, constraints.grade),
  };
  const issues: string[] = [];
  if (!checks.countRule) issues.push(`安装点数量不符合提示词规则：当前 ${placements.length} 个`);
  if (!checks.uniqueAssets) issues.push("存在重复岩点资产");
  if (!checks.requiredRoles) issues.push("起步、中间动作、脚点或终点不完整");
  if (!checks.startFinish) issues.push("起步或终点高度不合理");
  if (!checks.handReach) issues.push(reachFailures[0] ? `第 ${reachFailures[0].step} 步手部移动或双手跨度过大` : "无法建立完整左右手动作序列");
  if (!checks.footSupport) issues.push(unusedFeet.length ? `有 ${unusedFeet.length} 个脚点未参与起步或动作支撑，不为凑点保留` : `第 ${beta.find((step) => !step.supported)?.step ?? 1} 步没有可用脚点支撑`);
  if (!checks.spacing) issues.push(`有 ${overlaps} 组岩点轮廓可能重叠`);
  if (!checks.startStance) issues.push("起步必须有两个独立脚点和一至两个手点");
  if (!checks.gradeFit) issues.push(difficulty.cruxGrade > constraints.grade + 1
    ? `单步难点代理估计 V${difficulty.cruxGrade}，高于目标 V${constraints.grade} 超过一级，不能被简单动作平均稀释`
    : `难度代理估计 V${difficulty.estimatedGrade}，偏离目标 V${constraints.grade} 超过一级`);
  const score = clamp(100 - (checks.countRule ? 0 : 35) - (checks.uniqueAssets ? 0 : 30) - (checks.requiredRoles ? 0 : 35) - (checks.startFinish ? 0 : 20) - (checks.startStance ? 0 : 30) - reachFailures.length * 14 - Math.round((100 - supportedMoveRatio) * 0.35) - overlaps * 8 - difficulty.gradeDeviation * 10, 0, 100);
  return {
    totalCount: placements.length,
    handCount: placements.length - feet.length,
    footCount: feet.length,
    moveCount: beta.length,
    maxSpanCm: Math.max(0, ...beta.map((step) => step.handSpanCm)),
    maxMoveCm: Math.max(0, ...beta.map((step) => step.moveCm)),
    supportedMoveRatio,
    ...difficulty,
    startHoldCount: stance.startHoldCount,
    startHandCount: stance.startHandCount,
    startFootCount: stance.startFootCount,
    score,
    passed: Object.values(checks).every(Boolean),
    checks,
    beta,
    issues,
  };
}

function buildCandidate(plan: AiPlan, holds: HoldAsset[], constraints: RouteConstraints, variant: number, attempt: number) {
  let placements = materialize(buildDraft(plan, constraints, variant, attempt), holds, constraints);
  const holdById = new Map(holds.map((hold) => [hold.id, hold]));
  let metrics = validate(placements, constraints, holdById);
  const usedSupport = new Set(metrics.beta.flatMap((step) => step.supportHoldIds ?? []));
  const trimmed = placements.filter((point) => point.role !== "foot" || point.startLimbs?.length || usedSupport.has(point.holdId));
  if (trimmed.length < placements.length && countPass(trimmed.length, constraints)) {
    placements = trimmed;
    metrics = validate(placements, constraints, holdById);
  }
  return {
    title: plan.title,
    subtitle: plan.subtitle,
    grade: `V${constraints.grade} · ${metrics.moveCount} 步 / ${metrics.totalCount} 点`,
    reach: `${metrics.maxMoveCm} cm 最大移动`,
    focus: plan.focus,
    placements,
    metrics,
  } satisfies FinalCandidate;
}

export function solveAndRankPlans(plans: AiPlan[], holds: HoldAsset[], constraints: RouteConstraints) {
  const pool = [...plans, ...fallbackPlans(constraints)].slice(0, 8);
  const solved = pool.flatMap((plan, variant) => {
    const attempts: FinalCandidate[] = [];
    const totals = constraints.pointCountMode === "exact" || constraints.actionCountExplicit ? [constraints.targetTotalHolds]
      : [...new Set([constraints.targetTotalHolds, constraints.targetTotalHolds - 1, constraints.targetTotalHolds + 1, constraints.targetTotalHolds - 2])]
        .filter((total) => total >= constraints.minTotalHolds && total <= constraints.maxTotalHolds);
    for (const total of totals) for (let attempt = 0; attempt < 5; attempt += 1) {
      try { attempts.push(buildCandidate(plan, holds, { ...constraints, targetTotalHolds: total }, variant, attempt)); } catch { /* bounded repair */ }
    }
    return attempts.filter((candidate) => candidate.metrics.passed)
      .sort((a, b) => b.metrics.score - a.metrics.score || a.metrics.totalCount - b.metrics.totalCount).slice(0, 1);
  }).sort((a, b) => Number(b.metrics.passed) - Number(a.metrics.passed) || b.metrics.score - a.metrics.score);
  const selected: FinalCandidate[] = [];
  const titles = new Set<string>();
  for (const candidate of solved) {
    if (titles.has(candidate.title)) continue;
    selected.push(candidate);
    titles.add(candidate.title);
    if (selected.length === 3) break;
  }
  if (selected.length < 3) throw new Error(`未找到三条同时满足 V${constraints.grade} 难度匹配、${constraints.startPointCount ?? "3～4"} 点起步、点数、可达性和支撑条件的自由线路；请调整要求后重试`);
  return selected;
}

type FixedNode = FixedBoardPlacement & { asset: HoldAsset };
type FixedHandUsage = {
  instanceId: string;
  step: number;
  hand: HandSide;
  technique: string;
};
type FixedMoveRecord = {
  step: number;
  hand: "left" | "right";
  fromInstanceId: string;
  toInstanceId: string;
  moveCm: number;
  handSpanCm: number;
  technique: string;
  supportInstanceIds: string[];
};
type FixedSearchState = {
  leftId: string;
  rightId: string;
  startIds: string[];
  startFootIds: string[];
  handUsages: FixedHandUsage[];
  moves: FixedMoveRecord[];
  handIds: Set<string>;
  footIds: Set<string>;
  lastHand: "left" | "right" | null;
  score: number;
};

function fixedBoardNodes(boardPlacements: FixedBoardPlacement[], holds: HoldAsset[]) {
  if (boardPlacements.length < 6) throw new Error("固定板至少需要安装 6 个岩点后才能生成线路");
  const holdById = new Map(holds.map((hold) => [hold.id, hold]));
  const seen = new Set<string>();
  const nodes: FixedNode[] = [];
  for (const placement of boardPlacements) {
    if (seen.has(placement.instanceId)) throw new Error(`固定板安装实例重复：${placement.instanceId}`);
    seen.add(placement.instanceId);
    const asset = holdById.get(placement.holdId);
    if (!asset) throw new Error(`固定板岩点 ${placement.instanceId} 引用了不存在的资产 ${placement.holdId}`);
    if (![placement.x, placement.y, placement.rotation].every(Number.isFinite)) throw new Error(`固定板岩点 ${placement.instanceId} 的坐标或角度无效`);
    if (placement.x < 0 || placement.x > 100 || placement.y < 0 || placement.y > 100) throw new Error(`固定板岩点 ${placement.instanceId} 超出墙面范围`);
    nodes.push({ ...placement, asset });
  }
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));
  if (maxY - minY < 42) throw new Error("固定板的纵向覆盖不足，起步区与终点区之间至少需要约 1.7 米高度差");
  const startFloor = Math.max(65, maxY - 28);
  const finishCeiling = Math.min(32, minY + 14);
  const starts = nodes.filter((node) => node.y >= startFloor && node.y <= maxY - 5);
  const finishes = nodes.filter((node) => node.y <= finishCeiling);
  if (!starts.length) throw new Error("固定板底部没有可用起步点");
  if (!finishes.length) throw new Error("固定板顶部没有可用终点");
  return { nodes, nodeById: new Map(nodes.map((node) => [node.instanceId, node])), starts, finishes, startFloor, finishCeiling };
}

function fixedReachLimit(constraints: RouteConstraints, technique: string) {
  const base = constraints.grade <= 2 ? 110 : constraints.grade <= 5 ? 130 : constraints.grade <= 7 ? 150 : 175;
  return base + (technique === "dynamic" ? 20 : 0);
}

function footSuitability(node: FixedNode) {
  const sizeIndex = holdSizes.indexOf(node.asset.size as typeof holdSizes[number]);
  const normalizedSize = sizeIndex < 0 ? 4 : sizeIndex;
  const gripBonus = node.asset.grip === "边缘点" ? 12 : ["捏点", "开放点", "综合"].includes(node.asset.grip) ? 7 : node.asset.grip === "造型" ? -18 : 2;
  const uncertain = /遮挡|未标注/.test(`${node.asset.description ?? ""}${node.asset.productType ?? ""}`) ? -12 : 0;
  return gripBonus + (6 - normalizedSize) * 2 + uncertain;
}

function directionVector(direction: AiMove["direction"]) {
  if (direction === "up-left") return { x: -0.72, y: -0.72 };
  if (direction === "up-right") return { x: 0.72, y: -0.72 };
  if (direction === "left") return { x: -1, y: 0 };
  if (direction === "right") return { x: 1, y: 0 };
  return { x: 0, y: -1 };
}

function fixedMoveScore(from: FixedNode, target: FixedNode, other: FixedNode, move: AiMove, constraints: RouteConstraints) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const desired = directionVector(move.direction);
  const directionFit = (dx / length) * desired.x + (dy / length) * desired.y;
  const moveCm = distanceCm(from, target);
  const amplitudeTarget = move.amplitude === "short" ? 62 : move.amplitude === "long" ? 125 : 90;
  const gripFit = target.asset.grip === move.preferredGrip ? 13 : 0;
  const effort = movementDifficulty(moveCm, distanceCm(other, target), target.asset, move.technique, constraints.wallAngleDegrees ?? 0);
  const difficultyFit = -Math.abs(effort - constraints.grade) * 11 - Math.max(0, effort - constraints.grade - 0.8) * 15;
  const progress = Math.max(-6, (from.y - target.y) * 0.55);
  const centered = -Math.max(0, Math.abs(target.x - other.x) - 28) * 0.18;
  return directionFit * 12 - Math.abs(moveCm - amplitudeTarget) * 0.055 + gripFit + difficultyFit + progress + centered;
}

function fixedSupportChoices(nodes: FixedNode[], target: FixedNode, other: FixedNode, state: FixedSearchState) {
  const bodyX = (target.x + other.x) / 2;
  const lowerHandY = Math.max(target.y, other.y);
  const ranked = nodes
    .filter((node) => node.instanceId !== target.instanceId && node.instanceId !== other.instanceId)
    .filter((node) => node.y >= lowerHandY + 4 && (node.y - lowerHandY) * 4 <= 150 && Math.abs(node.x - bodyX) * 4 <= 115)
    .map((node) => ({
      node,
      score: footSuitability(node)
        + (state.footIds.has(node.instanceId) ? 22 : state.handIds.has(node.instanceId) ? 20 : -10)
        - Math.abs(Math.abs(node.x - bodyX) * 4 - 45) * 0.035
        - Math.abs((node.y - lowerHandY) * 4 - 72) * 0.025,
    }))
    .sort((a, b) => b.score - a.score || a.node.instanceId.localeCompare(b.node.instanceId))
    .slice(0, 5);
  // One useful support is sufficient for the geometric proxy. Do not add a second
  // foot purely for a higher score or to fill the point budget.
  return ranked.slice(0, 3).map(({ node, score }) => ({ ids: [node.instanceId], score }));
}

function initialFixedStates(context: ReturnType<typeof fixedBoardNodes>, constraints: RouteConstraints, variant: number) {
  const desiredHands = allocationFor(constraints, variant).startCount;
  const starts = [...context.starts]
    .sort((a, b) => Math.abs(a.y - 78) - Math.abs(b.y - 78) || a.x - b.x)
    .slice(0, 36);
  const states: FixedSearchState[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    for (let j = desiredHands === 1 ? i : i + 1; j < (desiredHands === 1 ? i + 1 : starts.length); j += 1) {
      const a = starts[i];
      const b = starts[j];
      const separation = distanceCm(a, b);
      if (desiredHands === 2 && (separation < 22 || separation > 100 || Math.abs(a.y - b.y) > 12)) continue;
      if (desiredHands === 1 && (["XS", "S"].includes(a.asset.size) || a.asset.grip === "造型")) continue;
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      const lowerHandY = Math.max(left.y, right.y);
      const bodyX = (left.x + right.x) / 2;
      const feet = context.nodes.filter((node) => node.y >= lowerHandY + 4 && node.y <= lowerHandY + 30 && Math.abs(node.x - bodyX) <= 25)
        .map((node) => ({ node, score: footSuitability(node) - Math.abs(node.y - lowerHandY - 17) * 0.55 - Math.abs(node.x - bodyX) * 0.25 }))
        .sort((a, b) => b.score - a.score).slice(0, 5);
      const footChoices = feet.flatMap(({ node: first }, index) => feet.slice(index + 1).filter(({ node: second }) => distanceCm(first, second) >= 18 && distanceCm(first, second) <= 110).map(({ node: second }) => [first, second])).slice(0, 4);
      for (const chosenFeet of footChoices) states.push({
        leftId: left.instanceId,
        rightId: right.instanceId,
        startIds: [...new Set([left.instanceId, right.instanceId])],
        startFootIds: chosenFeet.sort((a, b) => a.x - b.x).map((node) => node.instanceId),
        handUsages: desiredHands === 1 ? [{ instanceId: left.instanceId, step: 0, hand: "both", technique: "match" }] : [
          { instanceId: left.instanceId, step: 0, hand: "left", technique: "static" },
          { instanceId: right.instanceId, step: 0, hand: "right", technique: "static" },
        ],
        moves: [],
        handIds: new Set([left.instanceId, right.instanceId]),
        footIds: new Set(chosenFeet.map((node) => node.instanceId)),
        lastHand: null,
        score: 8 - Math.abs((left.y + right.y) / 2 - 78) * 0.4 - Math.abs(separation - 55) * 0.025,
      });
    }
  }
  return states.sort((a, b) => b.score - a.score).slice(0, 40);
}

function fixedStateCount(state: FixedSearchState) {
  return new Set([...state.handIds, ...state.footIds]).size;
}

function searchFixedPlan(plan: AiPlan, context: ReturnType<typeof fixedBoardNodes>, constraints: RouteConstraints, variant: number, actionOverride?: number) {
  const base = normalizePlan(plan, constraints, variant);
  const normalized = actionOverride === undefined ? base : { ...base, moves: Array.from({ length: actionOverride }, (_, index) => plan.moves[index] ?? base.moves[index % base.moves.length]) };
  const finishIds = new Set(context.finishes.map((node) => node.instanceId));
  let beam = initialFixedStates(context, constraints, variant);
  const actionCount = normalized.moves.length;
  for (let index = 0; index < actionCount; index += 1) {
    const desiredMove = normalized.moves[index];
    const lastMove = index === actionCount - 1;
    const next: FixedSearchState[] = [];
    for (const state of beam) {
      const hand = sideForMove(desiredMove, index, state.lastHand);
      const movingId = hand === "left" ? state.leftId : state.rightId;
      const otherId = hand === "left" ? state.rightId : state.leftId;
      const moving = context.nodeById.get(movingId);
      const other = context.nodeById.get(otherId);
      if (!moving || !other) continue;
      const reachLimit = fixedReachLimit(constraints, desiredMove.technique);
      const startingY = state.startIds.reduce((sum, id) => sum + (context.nodeById.get(id)?.y ?? 78), 0) / state.startIds.length;
      const expectedY = startingY + (Math.min(16, context.finishCeiling) - startingY) * (index + 1) / actionCount;
      let targets = desiredMove.direction === "match" || desiredMove.technique === "match"
        ? [other]
        : context.nodes.filter((node) => node.instanceId !== movingId && node.instanceId !== otherId && !state.handIds.has(node.instanceId));
      if (lastMove) targets = targets.filter((node) => finishIds.has(node.instanceId));
      targets = targets
        .filter((node) => distanceCm(moving, node) <= reachLimit)
        .filter((node) => distanceCm(other, node) <= reachLimit + 22)
        .filter((node) => node.y - Math.min(moving.y, other.y) <= (constraints.traverse ? 18 : 11))
        .filter((node) => movementDifficulty(distanceCm(moving, node), distanceCm(other, node), node.asset, desiredMove.technique, constraints.wallAngleDegrees ?? 0) <= constraints.grade + 3)
        .map((node) => ({ node, score: fixedMoveScore(moving, node, other, desiredMove, constraints) - Math.abs(node.y - expectedY) * 2.2 }))
        .sort((a, b) => b.score - a.score || a.node.instanceId.localeCompare(b.node.instanceId))
        .slice(0, 12)
        .map(({ node }) => node);
      for (const target of targets) {
        const moveCm = Math.round(distanceCm(moving, target));
        const handSpanCm = Math.round(distanceCm(other, target));
        const supportChoices = fixedSupportChoices(context.nodes, target, other, state);
        for (const support of supportChoices) {
          const handIds = new Set(state.handIds).add(target.instanceId);
          const footIds = new Set(state.footIds);
          support.ids.forEach((id) => footIds.add(id));
          const selectedCount = new Set([...handIds, ...footIds]).size;
          if (selectedCount > constraints.maxTotalHolds) continue;
          const progressScore = fixedMoveScore(moving, target, other, desiredMove, constraints) - Math.abs(target.y - expectedY) * 2.2;
          const newlySelected = selectedCount - fixedStateCount(state);
          const countScore = -newlySelected * 3;
          const alternationScore = state.lastHand && state.lastHand !== hand ? 4 : state.lastHand === hand ? -5 : 0;
          const newState: FixedSearchState = {
            leftId: hand === "left" ? target.instanceId : state.leftId,
            rightId: hand === "right" ? target.instanceId : state.rightId,
            startIds: state.startIds,
            startFootIds: state.startFootIds,
            handUsages: [...state.handUsages, { instanceId: target.instanceId, step: index + 1, hand, technique: desiredMove.technique }],
            moves: [...state.moves, {
              step: index + 1,
              hand,
              fromInstanceId: moving.instanceId,
              toInstanceId: target.instanceId,
              moveCm,
              handSpanCm,
              technique: desiredMove.technique,
              supportInstanceIds: support.ids,
            }],
            handIds,
            footIds,
            lastHand: hand,
            score: state.score + progressScore + support.score * 0.18 + countScore + alternationScore,
          };
          if (lastMove && !countPass(fixedStateCount(newState), constraints)) continue;
          next.push(newState);
        }
      }
    }
    const signatures = new Set<string>();
    beam = next
      .sort((a, b) => b.score - a.score)
      .filter((state) => {
        const signature = `${state.leftId}|${state.rightId}|${state.lastHand}|${[...state.footIds].sort().join(",")}`;
        if (signatures.has(signature)) return false;
        signatures.add(signature);
        return true;
      })
      .slice(0, 52);
    if (!beam.length) break;
  }
  return beam.filter((state) => state.moves.length === actionCount && finishIds.has(state.moves.at(-1)?.toInstanceId ?? ""));
}

function fixedCandidate(plan: AiPlan, state: FixedSearchState, context: ReturnType<typeof fixedBoardNodes>, constraints: RouteConstraints) {
  const roleById = new Map<string, Set<PlacementRole>>();
  const stepById = new Map<string, number>();
  const handsById = new Map<string, Set<HandSide>>();
  const techniqueById = new Map<string, string>();
  const addRole = (id: string, role: PlacementRole) => {
    const roles = roleById.get(id) ?? new Set<PlacementRole>();
    roles.add(role);
    roleById.set(id, roles);
  };
  for (const usage of state.handUsages) {
    addRole(usage.instanceId, usage.step === 0 ? "start" : usage.step === state.moves.length ? "finish" : "move");
    stepById.set(usage.instanceId, Math.min(stepById.get(usage.instanceId) ?? usage.step, usage.step));
    const hands = handsById.get(usage.instanceId) ?? new Set<HandSide>();
    hands.add(usage.hand);
    handsById.set(usage.instanceId, hands);
    techniqueById.set(usage.instanceId, usage.technique);
  }
  for (const id of state.startFootIds) {
    addRole(id, "foot");
    stepById.set(id, 0);
  }
  for (const move of state.moves) for (const id of move.supportInstanceIds) {
    addRole(id, "foot");
    stepById.set(id, Math.min(stepById.get(id) ?? move.step, move.step));
  }
  const rolePriority: PlacementRole[] = ["start", "finish", "move", "foot"];
  const placements = [...roleById.entries()].map(([instanceId, roleSet]) => {
    const node = context.nodeById.get(instanceId);
    if (!node) throw new Error(`固定板安装实例已失效：${instanceId}`);
    const roles = rolePriority.filter((role) => roleSet.has(role));
    const hands = handsById.get(instanceId);
    const hand: HandSide | undefined = hands?.has("both") || (hands?.has("left") && hands.has("right")) ? "both" : hands?.has("left") ? "left" : hands?.has("right") ? "right" : undefined;
    const startUsage = state.handUsages.find((usage) => usage.instanceId === instanceId && usage.step === 0);
    const startFootIndex = state.startFootIds.indexOf(instanceId);
    const startLimbs: NonNullable<ResolvedPlacement["startLimbs"]> = startUsage?.hand === "both" ? ["LH", "RH"]
      : startUsage ? [startUsage.hand === "left" ? "LH" : "RH"] : startFootIndex >= 0 ? [startFootIndex === 0 ? "LF" : "RF"] : [];
    return {
      instanceId,
      holdId: node.holdId,
      x: node.x,
      y: node.y,
      rotation: node.rotation,
      scale: 1,
      role: roles[0],
      roles,
      step: stepById.get(instanceId) ?? 0,
      hand,
      ...(startLimbs.length ? { startLimbs } : {}),
      technique: techniqueById.get(instanceId) ?? (roleSet.has("foot") ? "support" : "static"),
    } satisfies ResolvedPlacement;
  }).sort((a, b) => a.step - b.step || rolePriority.indexOf(a.role) - rolePriority.indexOf(b.role));

  const beta: BetaStep[] = state.moves.map((move) => ({
    step: move.step,
    hand: move.hand,
    moveCm: move.moveCm,
    handSpanCm: move.handSpanCm,
    supported: move.supportInstanceIds.length > 0,
    technique: move.technique,
    targetInstanceId: move.toInstanceId,
    supportInstanceIds: move.supportInstanceIds,
  }));
  const reachFailures = beta.filter((step) => step.moveCm > fixedReachLimit(constraints, step.technique) || step.handSpanCm > fixedReachLimit(constraints, step.technique) + 22);
  const selectedIds = placements.map((placement) => placement.instanceId ?? "");
  const finish = state.moves.at(-1)?.toInstanceId;
  const stance = startStanceMetrics(placements, constraints);
  const difficulty = estimateDifficulty(beta, state.moves.map((move) => context.nodeById.get(move.toInstanceId)?.asset), constraints);
  const checks = {
    countRule: countPass(placements.length, constraints),
    uniqueAssets: new Set(selectedIds).size === selectedIds.length,
    requiredRoles: ["start", "move", "foot", "finish"].every((role) => placements.some((placement) => placement.roles?.includes(role as PlacementRole))),
    startFinish: state.startIds.every((id) => (context.nodeById.get(id)?.y ?? 0) >= context.startFloor) && Boolean(finish && (context.nodeById.get(finish)?.y ?? 100) <= context.finishCeiling),
    handReach: beta.length > 0 && reachFailures.length === 0,
    footSupport: beta.length > 0 && beta.every((step) => step.supported),
    spacing: true,
    startStance: stance.startStance,
    gradeFit: gradeFitsTarget(difficulty, constraints.grade),
    boardIntegrity: placements.every((placement) => {
      const node = context.nodeById.get(placement.instanceId ?? "");
      return Boolean(node && node.holdId === placement.holdId && node.x === placement.x && node.y === placement.y && node.rotation === placement.rotation);
    }),
  };
  const supportedMoveRatio = beta.length ? Math.round(beta.filter((step) => step.supported).length / beta.length * 100) : 0;
  const issues: string[] = [];
  if (!checks.countRule) issues.push(`启用岩点数量不符合提示词规则：当前 ${placements.length} 个`);
  if (!checks.requiredRoles) issues.push("起步、中间动作、脚点或终点不完整");
  if (!checks.startFinish) issues.push("固定板的起步或终点位置不合理");
  if (!checks.handReach) issues.push(`第 ${reachFailures[0]?.step ?? 1} 步超出当前难度的手部可达范围`);
  if (!checks.footSupport) issues.push(`第 ${beta.find((step) => !step.supported)?.step ?? 1} 步没有固定板脚点支撑`);
  if (!checks.boardIntegrity) issues.push("候选线路包含已移动或不存在的固定板岩点");
  if (!checks.startStance) issues.push("起步必须有两个独立脚点和一至两个手点");
  if (!checks.gradeFit) issues.push(difficulty.cruxGrade > constraints.grade + 1
    ? `单步难点代理估计 V${difficulty.cruxGrade}，高于目标 V${constraints.grade} 超过一级，不能被简单动作平均稀释`
    : `难度代理估计 V${difficulty.estimatedGrade}，偏离目标 V${constraints.grade} 超过一级`);
  const score = clamp(90 + state.score / Math.max(12, beta.length * 10) - difficulty.gradeDeviation * 12 - issues.length * 15 - placements.length * 0.15, 0, 100);
  const metrics: CandidateMetrics = {
    totalCount: placements.length,
    handCount: state.handIds.size,
    footCount: state.footIds.size,
    moveCount: beta.length,
    maxSpanCm: Math.max(0, ...beta.map((step) => step.handSpanCm)),
    maxMoveCm: Math.max(0, ...beta.map((step) => step.moveCm)),
    supportedMoveRatio,
    ...difficulty,
    startHoldCount: stance.startHoldCount,
    startHandCount: stance.startHandCount,
    startFootCount: stance.startFootCount,
    score,
    passed: Object.values(checks).every(Boolean),
    checks,
    beta,
    issues,
  };
  return {
    title: plan.title,
    subtitle: plan.subtitle,
    grade: `V${constraints.grade} · ${metrics.moveCount} 步 / ${metrics.totalCount} 点`,
    reach: `${metrics.maxMoveCm} cm 最大移动`,
    focus: plan.focus,
    placements,
    metrics,
  } satisfies FinalCandidate;
}

function candidateInstanceIds(candidate: FinalCandidate) {
  return new Set(candidate.placements.map((placement) => placement.instanceId).filter((id): id is string => Boolean(id)));
}

function jaccard(a: Set<string>, b: Set<string>) {
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

export function solveAndRankFixedBoardPlans(plans: AiPlan[], boardPlacements: FixedBoardPlacement[], holds: HoldAsset[], constraints: RouteConstraints) {
  const context = fixedBoardNodes(boardPlacements, holds);
  if (context.nodes.length < constraints.minTotalHolds) throw new Error(`固定板可用岩点不足：提示词至少需要 ${constraints.minTotalHolds} 个，板上只有 ${context.nodes.length} 个`);
  const pool = [...plans, ...fallbackPlans(constraints)].slice(0, 8);
  const solved = pool.flatMap((plan, variant) => {
    const preferredActions = allocationFor(constraints, variant).actionCount;
    const actionCounts = constraints.actionCountExplicit ? [preferredActions]
      : [...new Set([preferredActions, preferredActions + 1, preferredActions - 1, preferredActions + 2])]
        .filter((count) => count >= 2 && count <= 12 && count <= constraints.maxTotalHolds - 2);
    return actionCounts.flatMap((count) => searchFixedPlan(plan, context, constraints, variant, count)
      .sort((a, b) => b.score - a.score).slice(0, 6)
      .map((state) => fixedCandidate(plan, state, context, constraints)));
  }).filter((candidate) => candidate.metrics.passed);
  const selected: FinalCandidate[] = [];
  const usedTitles = new Set<string>();
  while (selected.length < 3) {
    const ranked = solved
      .filter((candidate) => !selected.includes(candidate) && !usedTitles.has(candidate.title))
      .map((candidate) => {
        const ids = candidateInstanceIds(candidate);
        const overlap = Math.max(0, ...selected.map((picked) => jaccard(ids, candidateInstanceIds(picked))));
        return { candidate, diversifiedScore: candidate.metrics.score - overlap * 24 };
      })
      .sort((a, b) => b.diversifiedScore - a.diversifiedScore);
    const next = ranked[0]?.candidate;
    if (!next) break;
    selected.push(next);
    usedTitles.add(next.title);
  }
  if (selected.length < 3) throw new Error(`固定板未找到三条同时满足 V${constraints.grade} 难度匹配、${constraints.startPointCount ?? "3～4"} 点起步、点数和支撑条件的候选；请调整角度、点数或目标难度，不能把偏难线路当作目标难度交付`);
  return selected;
}

export function fixedBoardSummary(boardPlacements: FixedBoardPlacement[], holds: HoldAsset[]) {
  const context = fixedBoardNodes(boardPlacements, holds);
  return {
    installedCount: context.nodes.length,
    coordinateSystem: "4m × 4m 墙面百分比坐标，y=0 为顶部",
    immutablePlacements: context.nodes.map((node) => ({
      instanceId: node.instanceId,
      x: node.x,
      y: node.y,
      rotation: node.rotation,
      grip: node.asset.grip,
      size: node.asset.size,
      ...(node.asset.material === "现场固定板" ? {
        serial: node.asset.serial,
        visualDescription: node.asset.description,
        attributeBasis: "抓型与尺寸为视觉估计，非实测；各点照片/GLB配准状态见visualDescription，扫描未覆盖、待复核或人工移动失效的点不可当作已验证三维几何",
      } : {}),
    })),
    instruction: "岩点已经安装，动作计划只能从这些安装实例中选择，不得建议新增、移动、旋转或缩放岩点。",
  };
}

export function inventorySummary(holds: HoldAsset[]) {
  const countBy = (key: "grip" | "size" | "material") => Object.fromEntries([...new Set(holds.map((hold) => hold[key]))].sort().map((value) => [value, holds.filter((hold) => hold[key] === value).length]));
  return {
    totalIndependentAssets: holds.length,
    byGrip: countBy("grip"),
    bySize: countBy("size"),
    byMaterial: countBy("material"),
    availableGrips: [...new Set(holds.map((hold) => hold.grip).filter((grip) => grip !== "造型"))],
  };
}
