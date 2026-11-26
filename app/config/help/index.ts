import { ADMIN_GUIDES } from './adminGuides';
import { DISPATCH_GUIDES } from './dispatchGuides';
import { CLIENT_GUIDES } from './clientGuides';
import type { HelpGuide } from './types';

export * from './types';
export { ADMIN_GUIDES, DISPATCH_GUIDES, CLIENT_GUIDES };

export const HELP_GUIDES: readonly HelpGuide[] = [
  ...ADMIN_GUIDES,
  ...DISPATCH_GUIDES,
  ...CLIENT_GUIDES,
];
