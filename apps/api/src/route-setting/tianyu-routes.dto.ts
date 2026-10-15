import { z } from 'zod';
import { parseWithSchema } from '../common/zod-validation';

const id = z.string().trim().min(1).max(128);
const pointSchema = z.object({
  holdId: id,
  roles: z.array(z.enum(['move', 'foot', 'finish'])).max(3),
  startLimbs: z.array(z.enum(['LH', 'RH', 'LF', 'RF'])).max(4),
}).strict();
const moveSchema = z.object({
  id, holdId: id, hand: z.enum(['left', 'right', 'both']),
  technique: z.string().max(80), note: z.string().max(500),
}).strict();
const holdSchema = z.object({
  id, serial: z.string().min(1).max(80), x: z.number().min(0).max(100), y: z.number().min(0).max(100),
  radius: z.number().min(0.8).max(5), grip: z.string().min(1).max(40), size: z.string().min(1).max(16),
  source: z.enum(['auto', 'manual', 'reviewed']), confirmed: z.boolean(),
  confidence: z.number().min(0).max(1).optional(), humanEdited: z.boolean().optional(),
  color: z.string().max(500).optional(), shape: z.string().max(500).optional(),
  usage: z.string().max(500).optional(), notes: z.string().max(500).optional(), reviewedBy: z.string().max(500).optional(),
}).strict();

export const tianyuRouteDocumentSchema = z.object({
  version: z.literal(1), name: z.string().trim().min(1).max(80), grade: z.string().trim().min(1).max(32), notes: z.string().max(3000),
  board: z.object({ id: z.literal('TY-01'), revision: z.string().max(100), angle: z.number().int().min(0).max(60).multipleOf(5), holds: z.array(holdSchema).min(1).max(500) }).strict(),
  points: z.array(pointSchema).min(1).max(500), moves: z.array(moveSchema).max(100),
  origin: z.object({
    kind: z.enum(['manual', 'ai-assisted']), generationSource: z.enum(['ai', 'local-fallback']).optional(), model: z.string().max(128).optional(), prompt: z.string().max(5000).optional(),
    candidateTitle: z.string().max(100).optional(), initialPoints: z.array(pointSchema).max(500).optional(), initialMoves: z.array(moveSchema).max(100).optional(),
  }).strict(),
}).strict().superRefine((doc, ctx) => {
  const unique = (values: string[], message: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', message });
  };
  unique(doc.board.holds.map(h => h.id), '板面岩点编号不能重复');
  unique(doc.points.map(p => p.holdId), '线路点不能重复，请用动作列表记录复用');
  unique(doc.moves.map(m => m.id), '动作编号不能重复');
  unique(doc.points.flatMap(p => p.startLimbs), '同一只起步手或脚只能指定一个点');
  const holds = new Set(doc.board.holds.filter(h => h.confirmed).map(h => h.id));
  const points = new Set(doc.points.map(p => p.holdId));
  for (const p of [...doc.points, ...(doc.origin.initialPoints ?? [])]) {
    if (!holds.has(p.holdId)) ctx.addIssue({ code: 'custom', message: '线路引用了不存在或未确认的板面岩点' });
    unique(p.roles, '点位用途不能重复'); unique(p.startLimbs, '起步四肢不能重复');
  }
  if (doc.moves.some(m => !points.has(m.holdId))) ctx.addIssue({ code: 'custom', message: '动作必须引用当前线路中的点' });
  const original = new Set(doc.origin.initialPoints?.map(p => p.holdId) ?? []);
  if (doc.origin.initialMoves?.some(m => !original.has(m.holdId))) ctx.addIssue({ code: 'custom', message: '原始动作引用无效' });
});

export const createTianyuRouteSchema = z.object({ document: tianyuRouteDocumentSchema }).strict();
export const updateTianyuRouteSchema = createTianyuRouteSchema.extend({ revision: z.number().int().positive() });
export const parseCreateTianyuRoute = (body: unknown) => parseWithSchema(createTianyuRouteSchema, body);
export const parseUpdateTianyuRoute = (body: unknown) => parseWithSchema(updateTianyuRouteSchema, body);
export type TianyuRouteDocument = z.infer<typeof tianyuRouteDocumentSchema>;
