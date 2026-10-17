export const APP_NAME = 'LaunchPilot AI';
export const TAGLINE = 'From idea to launch, intelligently.';
export const FREE_LIFETIME_GENERATIONS = 3;
export const PRO_MONTHLY_GENERATIONS = 100;
export const FREE_PROJECT_LIMIT = 3;
export const PRO_PROJECT_LIMIT = 100;
export let EXACT_WHOP_CHECKOUT_URL = process.env.WHOP_PRO_CHECKOUT_URL?.trim() || "";
export const ADVANCED_TOOLS = new Set(['sales-page-generator', 'pricing-assistant', 'marketing-kit']);

export const TOOL_DETAILS = {
  'idea-validator': { title: 'Idea Validator', description: 'Pressure-test your idea before committing time and budget.', category: 'Strategy', pro: false },
  'product-blueprint': { title: 'Product Blueprint', description: 'Turn the concept into an actionable product scope.', category: 'Strategy', pro: false },
  'sales-page-generator': { title: 'Sales Page Generator', description: 'Draft clear, benefit-led sales copy you can edit and export.', category: 'Conversion', pro: true },
  'pricing-assistant': { title: 'Pricing Assistant', description: 'Create pricing hypotheses with transparent assumptions.', category: 'Strategy', pro: true },
  'marketing-kit': { title: 'Marketing Kit', description: 'Draft launch emails, social posts, hooks, and a content plan.', category: 'Marketing', pro: true }
} as const;

export type AiTool = keyof typeof TOOL_DETAILS;
export const isAiTool = (value: string): value is AiTool => value in TOOL_DETAILS;
