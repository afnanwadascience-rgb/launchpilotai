import { ADVANCED_TOOLS, FREE_PROJECT_LIMIT, PRO_PROJECT_LIMIT, FREE_LIFETIME_GENERATIONS, PRO_MONTHLY_GENERATIONS, type AiTool } from './constants';

export function canAccessTool(plan: 'FREE' | 'PRO', tool: AiTool): boolean {
  return plan === 'PRO' || !ADVANCED_TOOLS.has(tool);
}

export function canCreateProject(plan: 'FREE' | 'PRO', currentCount: number): boolean {
  return currentCount < (plan === 'PRO' ? PRO_PROJECT_LIMIT : FREE_PROJECT_LIMIT);
}

export function canGenerate(plan: 'FREE' | 'PRO', used: number): boolean {
  const limit = plan === 'PRO' ? PRO_MONTHLY_GENERATIONS : FREE_LIFETIME_GENERATIONS;
  return used < limit;
}
