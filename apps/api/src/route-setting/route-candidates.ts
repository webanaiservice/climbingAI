import { z } from "zod";
import type { AppEnvironment } from '../config/environment';

import {
  allocationFor,
  fallbackPlans,
  fixedBoardSummary,
  inventorySummary,
  parseRouteConstraints,
  solveAndRankFixedBoardPlans,
  solveAndRankPlans,
  type AiPlan,
  type FixedBoardPlacement,
  type HoldAsset,
} from "./route-engine";

const allowedModels = [
  "claude-opus-5",
  "claude-fable-5",
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-6-astra",
] as const;

const holdSchema = z.object({
  id: z.string().min(1),
  serial: z.string().min(1),
  grip: z.string().min(1),
  size: z.string().min(1),
  material: z.string().min(1),
  dimensions: z.string().max(120),
  productType: z.string().optional(),
  description: z.string().optional(),
});

const boardPlacementSchema = z.object({
  instanceId: z.string().trim().min(1).max(120),
  holdId: z.string().trim().min(1).max(120),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  rotation: z.number().finite().min(-360).max(360),
});

const requestSchema = z.object({
  prompt: z.string().trim().min(2).max(1200),
  model: z.enum(allowedModels),
  holds: z.array(holdSchema).min(6).max(500),
  mode: z.enum(["free", "fixed"]).optional(),
  boardPlacements: z.array(boardPlacementSchema).max(500).optional(),
  wallAngle: z.number().finite().int().min(0).max(60).refine((value) => value % 5 === 0, {
    message: "墙面角度必须以 5° 为步进",
  }).optional(),
});

const moveSchema = z.object({
  hand: z.enum(["left", "right", "either"]),
  direction: z.enum(["up-left", "up", "up-right", "left", "right", "match"]),
  amplitude: z.enum(["short", "medium", "long"]),
  technique: z.enum(["static", "side-pull", "cross", "match", "high-step", "flag", "dynamic"]),
  preferredGrip: z.string().min(1).max(20),
});

const planSchema = z.object({
  title: z.string().trim().min(2).max(18),
  subtitle: z.string().trim().min(4).max(80),
  focus: z.string().trim().min(2).max(32),
  moves: z.array(moveSchema).min(2).max(18),
});

const plansSchema = z.object({
  plans: z.array(planSchema).min(3).max(6),
});

const routePlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["plans"],
  properties: {
    plans: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "subtitle", "focus", "moves"],
        properties: {
          title: { type: "string", minLength: 2, maxLength: 18 },
          subtitle: { type: "string", minLength: 4, maxLength: 80 },
          focus: { type: "string", minLength: 2, maxLength: 32 },
          moves: {
            type: "array",
            minItems: 2,
            maxItems: 18,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["hand", "direction", "amplitude", "technique", "preferredGrip"],
              properties: {
                hand: { type: "string", enum: ["left", "right", "either"] },
                direction: { type: "string", enum: ["up-left", "up", "up-right", "left", "right", "match"] },
                amplitude: { type: "string", enum: ["short", "medium", "long"] },
                technique: { type: "string", enum: ["static", "side-pull", "cross", "match", "high-step", "flag", "dynamic"] },
                preferredGrip: { type: "string", minLength: 1, maxLength: 20 },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `你是一名经验丰富的抱石定线员。你的任务不是直接猜坐标或库存编号，而是为 4m × 4m 抱石墙编写可执行的左右手动作计划；墙面角度以用户上下文为准。

要求：
1. 每条计划要有清晰且不同的动作主题，左右手顺序应可读，避免同一只手无意义地连续移动。
2. 起步固定为两个独立脚点，配一至两个手点：三点起步为双手共用一个手点，四点起步为两手点。随后关注重心、脚点持续受力与连贯性。
3. preferredGrip 只能从给定可用抓握类型中选择。
4. 不要输出坐标、岩点 ID、点数结论或解释性散文；本地求解器会负责坐标、真实岩点匹配、点数约束和逐步校验。
5. 以目标难度和动作质量为首要目标；V6 不等于连续大跨度或连续小边点。不要靠增加无意义的中间点或脚点凑数，应考虑已有手点转脚与脚点复用。
6. 未指定点数时按动作需要选择长度；“约9点”与“9点”是数量参考，不要求凑满；“恰好/最多/至少/范围”属于明确约束，不得擅自放宽。动态动作要有接住后的稳定支撑。
7. 抓型、尺寸和用途可能来自照片视觉估计，缺少实测深度/摩擦与试爬样本，不声称已得到准确等级。
8. 必须严格输出指定 JSON 结构，并以一个 json 对象返回。`;

function trimBase(value: string) {
  return value.replace(/\/+$/, "");
}

function parseJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    throw new Error("模型未返回可解析的 JSON");
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProvider(url: string, init: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchWithTimeout(url, init);
    if (![429, 500, 502, 503, 529].includes(response.status) || attempt === 1) return response;
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("上游模型暂时不可用");
}

function providerError(status: number) {
  // The upstream body is untrusted and may echo request headers or credentials.
  return new Error(`上游模型请求失败（${status}）`);
}

async function requestOpenAiPlan(model: string, apiKey: string, base: string, userContent: string) {
  const response = await fetchProvider(`${trimBase(base)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.72,
      max_tokens: 3200,
      response_format: {
        type: "json_schema",
        json_schema: { name: "route_plans", strict: true, schema: routePlanJsonSchema },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw providerError(response.status);
  const parsed = JSON.parse(body) as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
  const content = parsed.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : content?.map((item) => item.text ?? "").join("") ?? "";
  return plansSchema.parse(parseJsonObject(text)).plans;
}

async function requestClaudePlan(model: string, apiKey: string, base: string, userContent: string) {
  const response = await fetchProvider(`${trimBase(base)}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 3200,
      temperature: 0.72,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tools: [{
        name: "submit_route_plans",
        description: "提交三至六条专业抱石动作计划。",
        input_schema: routePlanJsonSchema,
      }],
      tool_choice: { type: "tool", name: "submit_route_plans" },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw providerError(response.status);
  const parsed = JSON.parse(body) as {
    content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }>;
  };
  const tool = parsed.content?.find((item) => item.type === "tool_use" && item.name === "submit_route_plans");
  if (tool?.input) return plansSchema.parse(tool.input).plans;
  const text = parsed.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "";
  return plansSchema.parse(parseJsonObject(text)).plans;
}

function buildUserContent(prompt: string, constraints: ReturnType<typeof parseRouteConstraints>["constraints"], holds: HoldAsset[]) {
  const allocation = allocationFor(constraints);
  return JSON.stringify({
    userRequest: prompt,
    wall: { widthM: 4, heightM: 4, angle: "vertical", gridCm: 20 },
    interpretedRequirements: {
      targetGrade: `V${constraints.grade}`,
      style: constraints.style,
      traverse: constraints.traverse,
      farFinish: constraints.farFinish,
      desiredHandMovesPerPlan: allocation.actionCount,
      pointCountPolicy: constraints.pointCountMode,
      pointCount: { targetHint: constraints.targetTotalHolds, min: constraints.minTotalHolds, max: constraints.maxTotalHolds, strict: !["auto", "around"].includes(constraints.pointCountMode) },
      startingStance: { totalPoints: constraints.startPointCount ?? "3或4", footPoints: 2, handPoints: constraints.startPointCount ? constraints.startPointCount - 2 : "1或2" },
      priority: "可行起步与动作 → 目标难度匹配 → 连贯性与支撑复用 → 数量参考；明确的数量上下限仍须遵守",
      note: "总安装点包括起步手脚点、中间手脚点和终点，同一安装点重复使用只计一次。动作数不是安装点数，不为凑满参考数量加点。",
    },
    inventory: inventorySummary(holds),
    responseFormat: "json object",
    output: "返回 3-6 条差异明确的动作计划，每条 moves 数量应接近 desiredHandMovesPerPlan。",
  });
}

function buildFixedUserContent(
  prompt: string,
  constraints: ReturnType<typeof parseRouteConstraints>["constraints"],
  holds: HoldAsset[],
  boardPlacements: FixedBoardPlacement[],
  wallAngle: number,
) {
  const allocation = allocationFor(constraints);
  return JSON.stringify({
    userRequest: prompt,
    mode: "fixed-board",
    wall: {
      widthM: 4,
      heightM: 4,
      angleDegreesFromVertical: wallAngle,
      angleConvention: "0° 为直壁，数值越大仰角越大，60° 为最大仰角",
    },
    interpretedRequirements: {
      targetGrade: `V${constraints.grade}`,
      style: constraints.style,
      traverse: constraints.traverse,
      farFinish: constraints.farFinish,
      desiredHandMovesPerPlan: allocation.actionCount,
      pointCountPolicy: constraints.pointCountMode,
      pointCount: { targetHint: constraints.targetTotalHolds, min: constraints.minTotalHolds, max: constraints.maxTotalHolds, strict: !["auto", "around"].includes(constraints.pointCountMode) },
      startingStance: { totalPoints: constraints.startPointCount ?? "3或4", footPoints: 2, handPoints: constraints.startPointCount ? constraints.startPointCount - 2 : "1或2" },
      priority: "可行起步与动作 → 目标难度匹配 → 连贯性与支撑复用 → 数量参考；明确的数量上下限仍须遵守",
      note: "总点数包括起步手脚点、中间手脚点和终点，统计候选线路启用的不同安装实例，不把多条候选相加。同一安装实例反复用手或脚只计一点。不要添加无用点或新脚点来凑参考数量。",
    },
    fixedBoard: fixedBoardSummary(boardPlacements, holds),
    planningInstruction: `请依据固定板已有岩点的空间分布、抓握类型和 ${wallAngle}° 墙面角度规划动作方向、手序与技术主题。角度越大，应更重视脚点持续受力、核心张力与抓握强度，不要仅把直壁动作原样套用。不要输出坐标或岩点编号，本地 beam search 会把动作计划映射到不可移动的安装实例。`,
    responseFormat: "json object",
    output: "返回 3-6 条差异明确的动作计划，每条 moves 数量应接近 desiredHandMovesPerPlan。",
  });
}

function inventoryWarnings(holds: HoldAsset[]) {
  const hasFootSuitability = holds.some((hold) => /脚点|foothold|foot hold/i.test(`${hold.productType ?? ""} ${hold.description ?? ""}`));
  return hasFootSuitability
    ? []
    : ["产品表没有脚点适用性字段；当前脚点用途由尺寸与抓握类型推断，安装前需人工确认。"];
}

function compactReason(reason?: string) {
  if (!reason) return null;
  if (reason.trim().startsWith("[") || reason.includes('"invalid_type"')) return "模型返回结构不完整";
  return reason.length > 180 ? `${reason.slice(0, 177)}…` : reason;
}

function fallbackResponse(prompt: string, holds: HoldAsset[], model: string, reason?: string) {
  const { constraints, warnings } = parseRouteConstraints(prompt);
  const conciseReason = compactReason(reason);
  return {
    model,
    source: "local-fallback" as const,
    notice: conciseReason ? `云端动作规划暂不可用，已使用本地约束求解器：${conciseReason}` : "已使用本地约束求解器。",
    constraints,
    warnings: [...warnings, ...inventoryWarnings(holds)],
    candidates: solveAndRankPlans(fallbackPlans(constraints), holds, constraints),
  };
}

function fixedFallbackResponse(
  prompt: string,
  holds: HoldAsset[],
  boardPlacements: FixedBoardPlacement[],
  model: string,
  wallAngle: number,
  reason?: string,
) {
  const { constraints: parsedConstraints, warnings } = parseRouteConstraints(prompt);
  const constraints = { ...parsedConstraints, wallAngleDegrees: wallAngle };
  const conciseReason = compactReason(reason);
  const holdById = new Map(holds.map((hold) => [hold.id, hold]));
  const installedAssets = boardPlacements.map((placement) => holdById.get(placement.holdId)).filter((hold): hold is HoldAsset => Boolean(hold));
  return {
    mode: "fixed" as const,
    model,
    source: "local-fallback" as const,
    notice: conciseReason ? `云端动作规划暂不可用，已使用固定板本地搜索：${conciseReason}` : "已使用固定板本地搜索。",
    constraints,
    warnings: [...warnings, ...inventoryWarnings(installedAssets)],
    candidates: solveAndRankFixedBoardPlans(fallbackPlans(constraints), boardPlacements, holds, constraints),
  };
}

export async function generateRouteCandidates(
  payload: unknown,
  modelConfig: Pick<AppEnvironment, 'DEROUTER_API_KEY' | 'DEROUTER_OPENAI_BASE' | 'DEROUTER_ANTHROPIC_BASE'>,
) {
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(payload);
  } catch (error) {
    const issue = error instanceof z.ZodError ? error.issues[0] : null;
    const location = issue?.path.length ? `${issue.path.join(".")}：` : "";
    const detail = issue ? `${location}${issue.message}` : "请求不是有效 JSON";
    return Response.json({ error: `请求参数无效：${detail}` }, { status: 400 });
  }

  const holds = input.holds satisfies HoldAsset[];
  const mode = input.mode ?? (input.boardPlacements?.length ? "fixed" : "free");
  const boardPlacements = (input.boardPlacements ?? []) satisfies FixedBoardPlacement[];
  const wallAngle = mode === "fixed" ? (input.wallAngle ?? 0) : 0;
  const { constraints: parsedConstraints, warnings: parserWarnings } = parseRouteConstraints(input.prompt);
  const constraints = mode === "fixed"
    ? { ...parsedConstraints, wallAngleDegrees: wallAngle }
    : parsedConstraints;
  const holdById = new Map(holds.map((hold) => [hold.id, hold]));
  const installedAssets = boardPlacements.map((placement) => holdById.get(placement.holdId)).filter((hold): hold is HoldAsset => Boolean(hold));
  const warnings = [...parserWarnings, ...inventoryWarnings(mode === "fixed" ? installedAssets : holds)];
  const minimumRoutePoints = (constraints.startPointCount ?? 3) + 2;
  if (constraints.minTotalHolds > constraints.maxTotalHolds) {
    return Response.json({ error: `点数要求互相冲突：至少 ${constraints.minTotalHolds} 个，但最多 ${constraints.maxTotalHolds} 个。请调整提示词中的数量范围。`, constraints, warnings }, { status: 422 });
  }
  if (constraints.maxTotalHolds < minimumRoutePoints) {
    return Response.json({ error: `点数要求与起步冲突：${constraints.startPointCount ?? 3} 个起步点（含2脚点）加中间动作和终点，至少需要 ${minimumRoutePoints} 个独立点；不会自动放宽你的数量限制。`, constraints, warnings }, { status: 422 });
  }
  if (constraints.targetTotalHolds > 24 || constraints.minTotalHolds > 24 || constraints.maxTotalHolds > 24) {
    return Response.json({ error: "当前 POC 最多搜索 24 个独立线路点，请将数量要求设在支持范围内，或不指定点数。不会静默改写你的限制。", constraints, warnings }, { status: 422 });
  }
  if (mode === "fixed") {
    if (boardPlacements.length < 6) return Response.json({ error: "固定板至少需要安装 6 个岩点后才能生成线路。" }, { status: 422 });
    try {
      fixedBoardSummary(boardPlacements, holds);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "固定板数据无效" }, { status: 422 });
    }
  } else if (holds.length < constraints.targetTotalHolds) {
    return Response.json({ error: `独立岩点库存不足：需要 ${constraints.targetTotalHolds} 个，当前只有 ${holds.length} 个。` }, { status: 422 });
  }

  const apiKey = modelConfig.DEROUTER_API_KEY;
  if (!apiKey) {
    try {
      return Response.json(mode === "fixed"
        ? fixedFallbackResponse(input.prompt, holds, boardPlacements, input.model, wallAngle, "后台尚未配置模型密钥")
        : fallbackResponse(input.prompt, holds, input.model, "后台尚未配置模型密钥"));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "本地求解失败" }, { status: 422 });
    }
  }

  let plans: AiPlan[];
  try {
    const userContent = mode === "fixed"
      ? buildFixedUserContent(input.prompt, constraints, holds, boardPlacements, wallAngle)
      : buildUserContent(input.prompt, constraints, holds);
    plans = input.model.startsWith("claude-")
      ? await requestClaudePlan(input.model, apiKey, modelConfig.DEROUTER_ANTHROPIC_BASE, userContent)
      : await requestOpenAiPlan(input.model, apiKey, modelConfig.DEROUTER_OPENAI_BASE, userContent);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知上游错误";
    try {
      return Response.json(mode === "fixed"
        ? fixedFallbackResponse(input.prompt, holds, boardPlacements, input.model, wallAngle, reason)
        : fallbackResponse(input.prompt, holds, input.model, reason));
    } catch (solverError) {
      return Response.json({
        error: solverError instanceof Error ? solverError.message : "动作规划与本地求解均失败",
        detail: reason,
      }, { status: 422 });
    }
  }
  // A local quality/constraint failure is not an upstream outage. The solver
  // already searches fallback themes; retrying it here cannot justify relaxing
  // the grade or count rules and used to mislabel the reason for failure.
  try {
    const candidates = mode === "fixed"
      ? solveAndRankFixedBoardPlans(plans, boardPlacements, holds, constraints)
      : solveAndRankPlans(plans, holds, constraints);
    return Response.json({ mode, model: input.model, source: "ai", constraints, warnings, candidates });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "没有找到同时满足难度与线路约束的候选", constraints, warnings }, { status: 422 });
  }
}
