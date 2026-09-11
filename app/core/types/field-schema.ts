/**
 * Universal Field Schema Definitions
 * 
 * Provides a config-driven schema system for multi-step form rendering,
 * dynamic visibility toggles, and conditional requirement rules.
 */

export type FieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'location-autocomplete'
  | 'vehicle-select'
  | 'counter';

export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'in'
  | 'notIn'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'exists'
  | 'notExists'
  | 'isEmpty'
  | 'isNotEmpty';

/**
 * Atomic condition evaluated against form values.
 */
export interface FieldCondition {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
}

/**
 * Composite conditions grouped by logical AND / OR.
 */
export interface ConditionGroup {
  logicalOperator: 'AND' | 'OR';
  conditions: (FieldCondition | ConditionGroup)[];
}

export type ConditionRule = FieldCondition | ConditionGroup;

export type VisibilityAction = 'show' | 'hide';
export type RequirementAction = 'require' | 'optional';

/**
 * Dynamic visibility rule controlling when a field is shown or hidden.
 */
export interface DynamicVisibilityRule {
  /** Condition rule to evaluate against the current form values */
  when: ConditionRule;
  /** Action to apply when condition evaluates to true. Defaults to 'show'. */
  action?: VisibilityAction;
}

/**
 * Dynamic requirement rule controlling whether a field is mandatory.
 */
export interface DynamicRequirementRule {
  /** Condition rule to evaluate against the current form values */
  when: ConditionRule;
  /** Action to apply when condition evaluates to true. Defaults to 'require'. */
  action?: RequirementAction;
  /** Custom error message when required constraint fails */
  message?: string;
}

export interface FieldOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
}

export interface FieldUIPresentation {
  label: string;
  placeholder?: string;
  helperText?: string;
  tooltip?: string;
  /** Responsive column span (out of 12) in grid layouts */
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  order?: number;
  icon?: string;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
}

export interface FieldValidationRules {
  required?: boolean;
  requiredRule?: DynamicRequirementRule;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  customValidator?: string;
}

/**
 * Main FieldSchema defining dynamic visibility and requirement toggles.
 */
export interface FieldSchema<TValue = unknown> {
  id: string;
  name: string;
  type: FieldType;
  defaultValue?: TValue;
  presentation: FieldUIPresentation;
  validation?: FieldValidationRules;
  visibility?: DynamicVisibilityRule;
  requirement?: DynamicRequirementRule;
  /** List of field names this field depends on for re-evaluation */
  dependencies?: string[];
  options?: FieldOption[];
  metadata?: Record<string, unknown>;
}

export interface FormStepSchema {
  id: string;
  stepNumber: number;
  title: string;
  subtitle?: string;
  description?: string;
  fields: FieldSchema[];
  visibility?: DynamicVisibilityRule;
}

export interface FormSchema {
  id: string;
  version: string;
  title: string;
  description?: string;
  steps: FormStepSchema[];
}

/**
 * Helper to check if a condition rule is a nested group.
 */
export function isConditionGroup(rule: ConditionRule): rule is ConditionGroup {
  return 'logicalOperator' in rule && Array.isArray((rule as ConditionGroup).conditions);
}

/**
 * Evaluates a comparison operator against a target value and expected value.
 */
export function evaluateOperator(
  actual: unknown,
  operator: ComparisonOperator,
  expected?: unknown
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'notEquals':
      return actual !== expected;
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'notIn':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'greaterThan':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'greaterThanOrEqual':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lessThan':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lessThanOrEqual':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'notExists':
      return actual === undefined || actual === null;
    case 'isEmpty':
      if (actual === undefined || actual === null || actual === '') return true;
      if (Array.isArray(actual) && actual.length === 0) return true;
      return false;
    case 'isNotEmpty':
      if (actual === undefined || actual === null || actual === '') return false;
      if (Array.isArray(actual) && actual.length === 0) return false;
      return true;
    default:
      return false;
  }
}

/**
 * Recursively evaluates a ConditionRule against a dictionary of form values.
 */
export function evaluateCondition(
  rule: ConditionRule,
  formValues: Record<string, unknown>
): boolean {
  if (isConditionGroup(rule)) {
    if (rule.logicalOperator === 'AND') {
      return rule.conditions.every((subRule) => evaluateCondition(subRule, formValues));
    }
    if (rule.logicalOperator === 'OR') {
      return rule.conditions.some((subRule) => evaluateCondition(subRule, formValues));
    }
    return false;
  }

  const actualValue = formValues[rule.field];
  return evaluateOperator(actualValue, rule.operator, rule.value);
}

/**
 * Determines whether a field should currently be rendered/visible.
 */
export function isFieldVisible(
  field: FieldSchema,
  formValues: Record<string, unknown>
): boolean {
  if (!field.visibility) {
    return true;
  }

  const matched = evaluateCondition(field.visibility.when, formValues);
  const action = field.visibility.action ?? 'show';

  return action === 'show' ? matched : !matched;
}

/**
 * Determines whether a field is currently required based on static rules and dynamic toggles.
 */
export function isFieldRequired(
  field: FieldSchema,
  formValues: Record<string, unknown>
): boolean {
  let required = field.validation?.required ?? false;

  const dynamicRule = field.validation?.requiredRule ?? field.requirement;
  if (dynamicRule) {
    const matched = evaluateCondition(dynamicRule.when, formValues);
    const action = dynamicRule.action ?? 'require';
    if (action === 'require') {
      required = matched;
    } else {
      required = !matched;
    }
  }

  return required;
}
