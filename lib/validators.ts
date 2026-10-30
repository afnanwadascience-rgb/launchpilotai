import { z } from 'zod';

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().default('');

export const registrationSchema = z.object({
  name: shortText(80),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
});

export const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

const ideaInput = z.object({
  idea: shortText(1600), audience: shortText(800), problem: shortText(1200),
  category: shortText(80), budget: optionalText(120)
});
const blueprintInput = z.object({
  idea: shortText(1600), audience: shortText(800), goals: optionalText(1200),
  format: shortText(100), constraints: optionalText(1000)
});
const salesInput = z.object({
  product: shortText(1600), audience: shortText(800), benefits: shortText(1200),
  price: optionalText(100), tone: shortText(80)
});
const pricingInput = z.object({
  product: shortText(1200), productType: shortText(100), audience: shortText(800),
  value: shortText(1200), competitorPrices: optionalText(1200), tiers: optionalText(1000)
});
const marketingInput = z.object({
  product: shortText(1200), audience: shortText(800), format: z.enum(['social', 'email', 'announcement', 'hooks', 'calendar']),
  tone: shortText(80), platform: optionalText(100), goal: optionalText(500)
});

export const aiRequestSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('idea-validator'), input: ideaInput, projectId: z.string().cuid().nullable().optional() }),
  z.object({ tool: z.literal('product-blueprint'), input: blueprintInput, projectId: z.string().cuid().nullable().optional() }),
  z.object({ tool: z.literal('sales-page-generator'), input: salesInput, projectId: z.string().cuid().nullable().optional() }),
  z.object({ tool: z.literal('pricing-assistant'), input: pricingInput, projectId: z.string().cuid().nullable().optional() }),
  z.object({ tool: z.literal('marketing-kit'), input: marketingInput, projectId: z.string().cuid().nullable().optional() })
]);

export const projectCreateSchema = z.object({ title: shortText(180), description: optionalText(2000) });
export const projectUpdateSchema = z.object({ title: shortText(180).optional(), description: optionalText(2000).optional() }).refine((v) => Object.keys(v).length > 0);
export const taskCreateSchema = z.object({ title: shortText(180), description: optionalText(2000), dueDate: z.iso.datetime().nullable().optional(), priority: z.enum(['low', 'medium', 'high']).default('medium'), status: z.enum(['todo', 'in-progress', 'done']).default('todo'), projectId: z.string().cuid().nullable().optional() });
export const taskUpdateSchema = z.object({ title: shortText(180).optional(), description: optionalText(2000).optional(), dueDate: z.iso.datetime().nullable().optional(), priority: z.enum(['low', 'medium', 'high']).optional(), status: z.enum(['todo', 'in-progress', 'done']).optional(), projectId: z.string().cuid().nullable().optional() }).refine((v) => Object.keys(v).length > 0);
export const competitorSchema = z.object({ name: shortText(180), url: z.union([z.url().max(2048), z.literal('')]).optional(), observations: optionalText(4000), pricingNotes: optionalText(2000), researchedAt: z.iso.datetime().optional(), projectId: z.string().cuid().nullable().optional() });
export const contactSchema = z.object({ name: shortText(120), email: z.email().max(254), subject: shortText(180), message: shortText(6000) });
