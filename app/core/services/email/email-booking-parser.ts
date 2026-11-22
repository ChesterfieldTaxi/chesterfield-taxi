/**
 * Pure Dispatch Email Sanitizer & Deterministic Email-to-Booking Parser (`email-booking-parser.ts`)
 *
 * Strictly pure TypeScript (zero `node:*` imports, zero DOM `window`/`document` globals)
 * per `constitution.md` so it runs identically in SSR, serverless webhooks, tests, and client.
 */

import {
  detectAirportInAddresses,
  parseFlightIdent,
  resolveStlTerminalInfo,
} from '../../config/airports';
import type { CommsSuggestedBooking } from '../../types/comms';
import {
  DISPATCH_MAILBOX_ADDRESS,
  type DispatchEmailCategory,
  type DispatchEmailFolder,
} from '../../types/dispatch-email';
import { sanitizeToE164, validatePhoneNumber } from '../../utils/phone';
import { normalizeEmail } from '../customer/contact.service';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Subject Normalization & Address Header Parsing
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT_PREFIX_PATTERN =
  /^(?:(?:re|fwd?|aw)(?:\[\d+\])?\s*:\s*|\[website\s+inquiry(?:\s*-\s*[^\]]*)?\]\s*)+/i;

/**
 * Strips leading `Re:`, `Fwd:`, `FW:`, and `[Website Inquiry - ...]` prefixes
 * and collapses whitespace for deterministic thread subject correlation.
 */
export function normalizeEmailSubject(subject?: string | null): string {
  if (!subject || typeof subject !== 'string') return '';
  let current = subject.replace(/\s+/g, ' ').trim();
  let previous = '';
  while (current && current !== previous) {
    previous = current;
    current = current.replace(SUBJECT_PREFIX_PATTERN, '').trim();
  }
  return current.replace(/\s+/g, ' ').trim();
}

/**
 * Parses an RFC-5322 address header (e.g. `"Amanda Vance" <amanda.vance@bayer.com>`)
 * into `{ name, email }`.
 */
export function parseEmailDisplayAddress(raw?: string | null): {
  name: string;
  email: string;
} {
  if (!raw || typeof raw !== 'string') {
    return { name: '', email: '' };
  }
  const trimmed = raw.trim();
  const bracketMatch = trimmed.match(/^([\s\S]*?)<([^<>]+)>\s*$/);
  if (bracketMatch) {
    const rawName = bracketMatch[1]
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const email = normalizeEmail(bracketMatch[2]);
    return {
      name: rawName || formatFallbackNameFromEmail(email),
      email,
    };
  }

  const email = normalizeEmail(trimmed);
  if (email) {
    return {
      name: formatFallbackNameFromEmail(email),
      email,
    };
  }

  return {
    name: trimmed.replace(/^["']+|["']+$/g, '').trim(),
    email: '',
  };
}

function formatFallbackNameFromEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const local = email.split('@')[0] || '';
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pure HTML XSS Sanitizer & Plain-Text Fallback Converter
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EMAIL_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'blockquote',
  'hr',
  'a',
  'img',
]);

const VOID_EMAIL_TAGS = new Set(['br', 'hr', 'img']);

const GLOBAL_SAFE_ATTRS = new Set([
  'style',
  'align',
  'valign',
  'width',
  'height',
  'colspan',
  'rowspan',
  'cellpadding',
  'cellspacing',
  'border',
  'bgcolor',
  'title',
  'dir',
]);

const NAMED_HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  mdash: '—',
  ndash: '–',
  bull: '•',
  middot: '·',
  hellip: '…',
  copy: '©',
  reg: '®',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-fA-F]{1,6});?/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#(\d{1,7});?/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => {
      const lower = name.toLowerCase();
      return lower in NAMED_HTML_ENTITIES ? NAMED_HTML_ENTITIES[lower] : full;
    });
}

function escapeAttrValue(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeInlineStyleValue(rawStyle: string): string {
  const decoded = decodeHtmlEntities(rawStyle).replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = decoded.split(';');
  const safeDecls: string[] = [];

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;

    const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();
    const valCompact = val.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();

    // Block dangerous CSS properties and expressions
    if (
      prop === 'behavior' ||
      prop === '-moz-binding' ||
      prop === 'position' ||
      prop.startsWith('--')
    ) {
      continue;
    }
    if (
      valCompact.includes('expression(') ||
      valCompact.includes('javascript:') ||
      valCompact.includes('vbscript:') ||
      valCompact.includes('data:text/html') ||
      valCompact.includes('@import') ||
      valCompact.includes('url(')
    ) {
      continue;
    }
    safeDecls.push(`${prop}: ${val}`);
  }

  return safeDecls.join('; ');
}

function isSafeLinkHref(rawHref: string): boolean {
  const decoded = decodeHtmlEntities(rawHref)
    .replace(/[\u0000-\u0020\u007f]+/g, '')
    .trim();
  if (!decoded) return false;
  if (decoded.startsWith('#')) return true;
  if (decoded.startsWith('/') && !decoded.startsWith('//')) return true;

  const lower = decoded.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  );
}

function isSafeImgSrc(rawSrc: string): boolean {
  const decoded = decodeHtmlEntities(rawSrc)
    .replace(/[\u0000-\u0020\u007f]+/g, '')
    .trim();
  if (!decoded) return false;
  const lower = decoded.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html') ||
    lower.startsWith('data:image/svg')
  ) {
    return false;
  }
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('cid:')) {
    return true;
  }
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(decoded);
}

function sanitizeOpeningTag(tagName: string, rawAttrs: string): string {
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const sanitizedAttrs: string[] = [];
  let hasValidHref = false;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const attrName = match[1].toLowerCase();
    const rawVal = match[2] ?? match[3] ?? match[4] ?? '';

    // Never allow inline event handlers (`onclick`, `onerror`, `onload`, etc.) or script vectors
    if (
      attrName.startsWith('on') ||
      attrName === 'srcdoc' ||
      attrName === 'formaction' ||
      attrName === 'xlink:href' ||
      attrName === 'xmlns'
    ) {
      continue;
    }

    if (tagName === 'a' && attrName === 'href') {
      if (isSafeLinkHref(rawVal)) {
        sanitizedAttrs.push(`href="${escapeAttrValue(rawVal.trim())}"`);
        hasValidHref = true;
      }
      continue;
    }

    if (tagName === 'a' && (attrName === 'target' || attrName === 'rel')) {
      // Standardized below on all <a> tags
      continue;
    }

    if (tagName === 'img') {
      if (attrName === 'src') {
        if (isSafeImgSrc(rawVal)) {
          sanitizedAttrs.push(`src="${escapeAttrValue(rawVal.trim())}"`);
        }
        continue;
      }
      if (attrName === 'alt') {
        sanitizedAttrs.push(`alt="${escapeAttrValue(rawVal)}"`);
        continue;
      }
    }

    if (attrName === 'style') {
      const cleanStyle = sanitizeInlineStyleValue(rawVal);
      if (cleanStyle) {
        sanitizedAttrs.push(`style="${escapeAttrValue(cleanStyle)}"`);
      }
      continue;
    }

    if (GLOBAL_SAFE_ATTRS.has(attrName)) {
      sanitizedAttrs.push(`${attrName}="${escapeAttrValue(rawVal)}"`);
    }
  }

  if (tagName === 'a') {
    if (!hasValidHref) {
      sanitizedAttrs.unshift('href="#"');
    }
    sanitizedAttrs.push('target="_blank"');
    sanitizedAttrs.push('rel="noopener noreferrer"');
  }

  if (tagName === 'img' && !sanitizedAttrs.some((a) => a.startsWith('src='))) {
    // Drop broken/unsafe <img> tags whose `src` was rejected (e.g. `javascript:` or `x` with `onerror=`)
    return '';
  }

  const attrPart = sanitizedAttrs.length > 0 ? ` ${sanitizedAttrs.join(' ')}` : '';
  return VOID_EMAIL_TAGS.has(tagName) ? `<${tagName}${attrPart} />` : `<${tagName}${attrPart}>`;
}

/**
 * Pure allowlist HTML sanitizer for inbound/outbound dispatch emails:
 * - Strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<meta>`, `<link>`,
 *   `<base>`, `<svg>`, `<math>`, and `<style>` blocks/expressions.
 * - Strips all inline `on*=` event handlers (`onerror`, `onload`, `onclick`, etc.).
 * - Blocks `javascript:`, `vbscript:`, and `data:text/html` URIs (including entity-encoded variants).
 * - Preserves clean email formatting (`<p>`, `<br>`, `<div>`, `<span>`, `<strong>`, `<em>`,
 *   `<ul>`, `<ol>`, `<li>`, `<table>`, `<blockquote>`, `<hr>`, `<a>` with `target="_blank" rel="noopener noreferrer"`).
 */
export function sanitizeDispatchEmailHtml(rawHtml?: string | null): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let html = rawHtml;

  // 1. Strip comments, XML/DOCTYPE declarations, and CDATA
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');

  // 2. Completely remove executable / active / metadata container blocks AND their inner contents
  const dangerousContainers = [
    'script',
    'iframe',
    'object',
    'embed',
    'applet',
    'style',
    'head',
    'svg',
    'math',
    'noscript',
    'template',
  ];
  for (const tag of dangerousContainers) {
    const pairRe = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const orphanRe = new RegExp(`<\\/?${tag}\\b[^>]*\\/?>`, 'gi');
    html = html.replace(pairRe, '').replace(orphanRe, '');
  }

  // 3. Remove form controls, meta, link, base, and unwrap html/body wrappers
  html = html
    .replace(/<(?:meta|link|base|input|button|select|option|textarea|form)\b[^>]*\/?>/gi, '')
    .replace(/<\/(?:form|button|select|option|textarea|html|body)\s*>/gi, '')
    .replace(/<(?:html|body)\b[^>]*>/gi, '');

  // 4. Tokenize remaining HTML tags through strict tag & attribute allowlist
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g, (_, slash: string, rawName: string, rawAttrs: string) => {
    const tagName = rawName.toLowerCase();
    if (!ALLOWED_EMAIL_TAGS.has(tagName)) {
      return '';
    }
    if (slash) {
      return VOID_EMAIL_TAGS.has(tagName) ? '' : `</${tagName}>`;
    }
    return sanitizeOpeningTag(tagName, rawAttrs || '');
  });

  return html.trim();
}

/**
 * Pure HTML-to-plain-text fallback converter when `text` body is absent on an email.
 */
export function htmlToPlainText(rawHtml?: string | null): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let text = rawHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:script|style|head|svg|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|head|svg|noscript)\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*\/?>/gi, '\n---\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(?:p|div|tr|h[1-6]|blockquote|ul|ol|table|pre)\s*>/gi, '\n')
    .replace(/<\/(?:td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text);

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Renders plain text safely into clean HTML paragraphs when only `textBody` is provided.
 */
export function plainTextToSafeHtml(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return `<div style="font-family: Inter, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">${escaped.replace(
    /\r?\n/g,
    '<br />'
  )}</div>`;
}

/**
 * Builds a concise single-line preview snippet (`<= maxLen` chars) from plain text or HTML.
 */
export function buildEmailSnippet(textBody?: string | null, htmlBody?: string | null, maxLen = 160): string {
  const base = (textBody && textBody.trim()) || htmlToPlainText(htmlBody) || '';
  const collapsed = base.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen - 1).trimEnd()}…`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Deterministic Email-to-Booking Extractor & Classifier
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY_OWN_PHONES = new Set([
  '+13147380100',
  '+13142281454',
]);

const KNOWN_CARRIER_CODE_ALT =
  'WN|AA|DL|UA|AS|NK|F9|AC|LH|G4|B6|HA|SY|MX|OO|YX|SWA|AAL|DAL|UAL|ASA|NKS|FFT|ACA|DLH';

const KNOWN_CARRIER_NAME_ALT =
  'Southwest(?:\\s+Airlines)?|Delta(?:\\s+Air\\s+Lines)?|American(?:\\s+Airlines)?|United(?:\\s+Airlines)?|Alaska(?:\\s+Airlines)?|Spirit\\s+Airlines|Frontier(?:\\s+Airlines)?|Air\\s+Canada|Lufthansa|Allegiant(?:\\s+Air)?|JetBlue(?:\\s+Airways)?|Sun\\s+Country|Breeze(?:\\s+Airways)?';

export interface ExtractEmailBookingInput {
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
}

export interface ExtractedEmailBookingResult {
  folder: DispatchEmailFolder;
  category: DispatchEmailCategory;
  passengerName?: string;
  passengerPhone?: string; // E.164
  passengerEmail?: string; // lowercase
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupTime?: string;
  flightIdent?: string;
  airlineCode?: string;
  airlineName?: string;
  flightNumber?: string;
  airportCode?: string;
  isAirportTrip: boolean;
  isPrivateAviation: boolean;
  corporateAccountNumber?: string;
  poNumber?: string;
  tripId?: string;
  suggestedBooking?: CommsSuggestedBooking;
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[\s>•*\-·–—]+/, '').trim();
}

function extractLabeledField(lines: string[], labelRegex: RegExp): string {
  for (const rawLine of lines) {
    const line = stripBulletPrefix(rawLine);
    if (!line) continue;
    const m = line.match(labelRegex);
    if (m && m[1]) {
      const val = m[1].trim();
      if (val && val.toLowerCase() !== 'not provided' && val.toLowerCase() !== 'n/a') {
        return val;
      }
    }
  }
  return '';
}

function isEmailHeaderAddressValue(val: string): boolean {
  const lower = val.toLowerCase().trim();
  if (!lower) return true;
  if (lower.includes(DISPATCH_MAILBOX_ADDRESS)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return true;
  if (/^[^<>\r\n]{1,60}<[^\s@<>]+@[^\s@<>]+>$/.test(val.trim())) return true;
  return false;
}

function extractCustomerPhoneE164(lines: string[], fullText: string): string {
  // 1. Explicit phone labels
  const labeled = extractLabeledField(
    lines,
    /^(?:(?:Passenger|Contact|Mobile|Cell|Rider)\s+)?(?:Phone(?:\s*(?:Number|#))?|Mobile|Cell|Tel|Telephone)\s*[:#]\s*([+\d()\s.-]{10,24})/i
  );
  if (labeled) {
    const validated = validatePhoneNumber(labeled);
    if (validated.isValid && !COMPANY_OWN_PHONES.has(validated.e164)) {
      return validated.e164;
    }
    const e164 = sanitizeToE164(labeled);
    if (e164.replace(/\D/g, '').length >= 10 && !COMPANY_OWN_PHONES.has(e164)) {
      return e164;
    }
  }

  // 2. Inline `(Phone: 314-555-0144)` or general NANP/international scan in body
  const phoneRegex = /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
  let match: RegExpExecArray | null;
  while ((match = phoneRegex.exec(fullText)) !== null) {
    const candidate = match[0];
    const validated = validatePhoneNumber(candidate);
    const e164 = validated.isValid ? validated.e164 : sanitizeToE164(candidate);
    if (e164.replace(/\D/g, '').length >= 10 && !COMPANY_OWN_PHONES.has(e164)) {
      return e164;
    }
  }

  return '';
}

function extractFlightFromText(combinedText: string) {
  // 1. Explicit carrier code + 1-4 digit flight number (e.g. "DL 1492", "DL1492", "WN #1425")
  const codePattern = new RegExp(
    `\\b(${KNOWN_CARRIER_CODE_ALT})(?:[\\s#-]+|\\b)(\\d{1,4})\\b`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = codePattern.exec(combinedText)) !== null) {
    const parsed = parseFlightIdent(m[1], m[2]);
    if (parsed.isValid) return parsed;
  }

  // 2. Carrier full name + optional code + 1-4 digit flight number (e.g. "Southwest Airlines 1425", "Delta #1492")
  const namePattern = new RegExp(
    `\\b(${KNOWN_CARRIER_NAME_ALT})(?:\\s+flight)?[\\s#-]+(\\d{1,4})\\b`,
    'i'
  );
  const nameMatch = combinedText.match(namePattern);
  if (nameMatch) {
    const parsed = parseFlightIdent(nameMatch[1], nameMatch[2]);
    if (parsed.isValid) return parsed;
  }

  // 3. Explicit `Flight: XX 1234` label
  const flightLabelMatch = combinedText.match(
    /\bFlight(?:\s*(?:Number|#|No\.?))?\s*[:#]?\s*([A-Za-z0-9]{2,3})[\s#-]*(\d{1,4})\b/i
  );
  if (flightLabelMatch) {
    const parsed = parseFlightIdent(flightLabelMatch[1], flightLabelMatch[2]);
    if (parsed.isValid) return parsed;
  }

  return { airlineCode: '', airlineName: undefined, flightNumber: '', flightIdent: '', isValid: false };
}

function extractCorporateAccountAndPo(lines: string[], combinedText: string): {
  corporateAccountNumber?: string;
  poNumber?: string;
} {
  let corporateAccountNumber: string | undefined;
  let poNumber: string | undefined;

  // 1. Explicit hashtag/prefixed corporate codes (`#BY-8821`, `#CORP-BAYER-WEST`, `CORP-BAYER-WEST`)
  const codeTokenMatch = combinedText.match(
    /(#[A-Z]{2,10}-[A-Z0-9-]+|\bCORP-[A-Z0-9-]+)\b/i
  );
  if (codeTokenMatch && codeTokenMatch[1]) {
    corporateAccountNumber = codeTokenMatch[1].toUpperCase();
  }

  // 2. Explicit `Account:` label
  const accountLine = extractLabeledField(
    lines,
    /^(?:Corporate\s+)?Account(?:\s*(?:Number|#|No\.?|ID))?\s*:\s*(.+)$/i
  );
  if (accountLine && !corporateAccountNumber) {
    const innerToken = accountLine.match(/(#[A-Z0-9]{2,10}-[A-Z0-9-]+|\b[A-Z]{2,10}-\d{2,10})\b/i);
    corporateAccountNumber = innerToken ? innerToken[1].toUpperCase() : accountLine.trim();
  }

  // 3. Explicit `PO:` / `PO Number:` label
  const poLine = extractLabeledField(
    lines,
    /^(?:P\.?O\.?|Purchase\s+Order)(?:\s*(?:Number|#|No\.?))?\s*:\s*([A-Za-z0-9#_-]+)/i
  );
  if (poLine) {
    poNumber = poLine.trim();
    if (!corporateAccountNumber) {
      corporateAccountNumber = poNumber;
    }
  } else {
    const inlinePo = combinedText.match(/\bP\.?O\.?\s*(?:#|No\.?|Number)?\s*[:#]?\s*([A-Z0-9]{2,10}-[A-Z0-9-]+|#?[A-Z0-9]{4,16})\b/);
    if (inlinePo && inlinePo[1] && /\d/.test(inlinePo[1])) {
      poNumber = inlinePo[1].trim();
    }
  }

  return { corporateAccountNumber, poNumber };
}

function extractRequestedPickupTime(lines: string[], subject: string, bodyText: string): string | undefined {
  // 1. Labeled date/time line
  const labeled = extractLabeledField(
    lines,
    /^(?:Requested\s+)?(?:Pick[-\s]?up\s+(?:Date\s*(?:&|\/|and)?\s*)?Time|Date\s*(?:&|\/|and)\s*Time|Scheduled(?:\s+for)?|When|Date\/Time)\s*:\s*(.+)$/i
  );
  if (labeled) {
    return labeled;
  }

  // 2. Parenthetical date/time in subject e.g. `(Tomorrow 8:30 AM)`
  const subjectParen = subject.match(
    /\(((?:tomorrow|today|tonight|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)[^)]*\d{1,2}(?::\d{2})?\s*(?:AM|PM))\)/i
  );
  if (subjectParen && subjectParen[1]) {
    return subjectParen[1].trim();
  }

  // 3. Natural-language date + clock time in body or subject
  const combined = `${subject}\n${bodyText}`;
  const naturalMatch = combined.match(
    /\b((?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s+(?:morning|afternoon|evening|night))?(?:\s*(?:at|@|,|-)\s*|\s+)\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i
  );
  if (naturalMatch && naturalMatch[1]) {
    return naturalMatch[1].replace(/\s+/g, ' ').trim();
  }

  return undefined;
}

/**
 * Deterministically extracts structured ride booking metadata (`passengerName`, E.164
 * `passengerPhone`, `pickupLocation`, `dropoffLocation`, `pickupTime`, `flightIdent`,
 * `corporateAccountNumber`, STL/SUS/CPS airport intelligence) and classifies inbound
 * `folder` & `category`.
 */
export function extractSuggestedBookingFromEmail(
  input: ExtractEmailBookingInput
): ExtractedEmailBookingResult {
  const subject = String(input.subject || '').trim();
  const plainBody =
    (input.textBody && input.textBody.trim()) || htmlToPlainText(input.htmlBody) || '';
  const parsedFrom = parseEmailDisplayAddress(input.fromEmail);
  const passengerEmail = normalizeEmail(input.fromEmail) || parsedFrom.email || undefined;
  const fallbackFromName =
    String(input.fromName || '').trim() || parsedFrom.name || undefined;

  const lines = plainBody.split(/\r?\n/);
  const combinedText = `${subject}\n${plainBody}`;

  // 1. Passenger Name
  const labeledNameRaw = extractLabeledField(
    lines,
    /^(?:Passenger(?:\s+Name)?|Rider(?:\s+Name)?|Traveler|Guest|Client|Name)\s*:\s*([^\r\n]+)/i
  );
  const cleanedLabeledName = labeledNameRaw
    .replace(/\s*\((?:Phone|Mobile|Cell|Tel)[^)]*\)\s*$/i, '')
    .replace(/\s*<[^<>]+>\s*$/, '')
    .trim();
  const passengerName = cleanedLabeledName || fallbackFromName;

  // 2. Passenger Phone (E.164)
  const passengerPhone = extractCustomerPhoneE164(lines, plainBody) || undefined;

  // 3. Pickup & Dropoff Locations
  let pickupLocation = '';
  for (const rawLine of lines) {
    const line = stripBulletPrefix(rawLine);
    const m = line.match(
      /^(?:Pick[-\s]?up(?:\s+(?:Location|Address|Point))?|Origin|From)\s*:\s*(.+)$/i
    );
    if (m && m[1] && !isEmailHeaderAddressValue(m[1])) {
      pickupLocation = m[1].trim();
      break;
    }
  }

  let dropoffLocation = '';
  for (const rawLine of lines) {
    const line = stripBulletPrefix(rawLine);
    const m = line.match(
      /^(?:Drop[-\s]?off(?:\s+(?:Location|Address|Point))?|Destination|Dest|To)\s*:\s*(.+)$/i
    );
    if (m && m[1] && !isEmailHeaderAddressValue(m[1])) {
      dropoffLocation = m[1].trim();
      break;
    }
  }

  const hasExplicitRouteLabels = Boolean(pickupLocation && dropoffLocation);

  // Check classification signals before loose route fallback
  const isWebsiteInquiry =
    /\[website\s+inquiry\b/i.test(subject) || /^new\s+.*website\s+inquiry\b/im.test(plainBody);

  const isReceiptOrInvoiceRequest =
    !hasExplicitRouteLabels &&
    /\b(receipt\s+copy|trip\s+receipt|tax\s+receipt|resend.*receipt|copy\s+of.*(?:receipt|invoice)|itemized\s+(?:pdf\s+)?receipt|expense\s+report|invoice\s+copy|billing\s+statement)\b/i.test(
      combinedText
    );

  // Fallback subject/body `<Origin> to <Destination>` extraction when reservation intent exists
  const hasReservationIntent =
    /\b(booking|book\s+a|reservation|transfer(?:\s+request)?|pickup\s+request|executive\s+(?:sedan|transfer|car)|need\s+a\s+(?:ride|cab|car|taxi|sedan|suv|van)|pre-arrange|schedule\s+a\s+(?:ride|pickup|car|transfer)|airport\s+(?:pickup|transfer|ride|dropoff))\b/i.test(
      combinedText
    );

  if (!isReceiptOrInvoiceRequest && (!pickupLocation || !dropoffLocation) && hasReservationIntent) {
    const subjectRoute = subject.match(
      /(?:-\s*|\bfrom\s+)([A-Za-z0-9.,#'&\s()-]{3,70}?)\s+to\s+([A-Za-z0-9.,#'&\s()-]{3,70}?)(?:\s*\([^)]*\))?$/i
    );
    if (subjectRoute) {
      if (!pickupLocation) pickupLocation = subjectRoute[1].trim();
      if (!dropoffLocation) dropoffLocation = subjectRoute[2].trim();
    }
  }

  // 4. Regional Airport & Flight Intelligence (`STL` / `SUS` / `CPS`)
  const airportDetection = detectAirportInAddresses(
    pickupLocation || combinedText,
    dropoffLocation || ''
  );
  const parsedFlight = extractFlightFromText(combinedText);
  const airportCode = airportDetection.airport?.iataCode || (parsedFlight.isValid ? 'STL' : undefined);

  // 5. Pickup Time, Corporate Account / PO, and Trip Reference
  const pickupTime = extractRequestedPickupTime(lines, subject, plainBody);
  const { corporateAccountNumber, poNumber } = extractCorporateAccountAndPo(lines, combinedText);

  const labeledTripRef = extractLabeledField(
    lines,
    /^Trip(?:\s+(?:Reference|Ref|ID|#))?\s*:\s*#?([A-Za-z0-9_-]{4,24})$/i
  );
  const inlineTripRef = combinedText.match(/\b(CT-\d{4,12}|TRIP-\d{3,12})\b/i);
  const tripId = labeledTripRef || (inlineTripRef ? inlineTripRef[1].toUpperCase() : undefined);

  // 6. Folder & Category Classification
  let folder: DispatchEmailFolder = 'inbox';
  let category: DispatchEmailCategory = 'general';

  if (isWebsiteInquiry) {
    folder = 'inquiries';
    category = 'website_inquiry';
  } else if (isReceiptOrInvoiceRequest) {
    folder = 'receipts';
    category = /\binvoice\b/i.test(combinedText) ? 'corporate_invoice' : 'trip_receipt';
  } else if (
    (pickupLocation && dropoffLocation) ||
    (hasReservationIntent &&
      Boolean(pickupLocation || dropoffLocation || parsedFlight.isValid || pickupTime))
  ) {
    folder = 'bookings';
    category = 'booking_request';
  }

  // 7. Build deterministic `CommsSuggestedBooking` when booking request or structured route exists
  let suggestedBooking: CommsSuggestedBooking | undefined;
  if (folder === 'bookings' || (pickupLocation && dropoffLocation && !isReceiptOrInvoiceRequest)) {
    const noteSegments: string[] = [];
    if (parsedFlight.isValid) {
      const termInfo = resolveStlTerminalInfo(parsedFlight.airlineCode, airportCode || 'STL');
      noteSegments.push(
        `Flight ${parsedFlight.flightIdent}${
          termInfo.terminal ? ` (${termInfo.shortTerminal})` : ''
        }`
      );
    }
    if (pickupTime) {
      noteSegments.push(`Requested Time: ${pickupTime}`);
    }
    if (corporateAccountNumber) {
      noteSegments.push(`Account: ${corporateAccountNumber}`);
    }
    if (poNumber && poNumber !== corporateAccountNumber) {
      noteSegments.push(`PO: ${poNumber}`);
    }

    suggestedBooking = {
      passengerName,
      passengerPhone,
      passengerEmail,
      pickup: pickupLocation || undefined,
      dropoff: dropoffLocation || undefined,
      pickupLocation: pickupLocation || undefined,
      dropoffLocation: dropoffLocation || undefined,
      pickupTime,
      notes:
        noteSegments.length > 0
          ? noteSegments.join(' · ')
          : subject
          ? `Email Request: ${subject}`
          : undefined,
    };
  }

  return {
    folder,
    category,
    passengerName,
    passengerPhone,
    passengerEmail,
    pickupLocation: pickupLocation || undefined,
    dropoffLocation: dropoffLocation || undefined,
    pickupTime,
    flightIdent: parsedFlight.isValid ? parsedFlight.flightIdent : undefined,
    airlineCode: parsedFlight.isValid ? parsedFlight.airlineCode : undefined,
    airlineName: parsedFlight.isValid ? parsedFlight.airlineName : undefined,
    flightNumber: parsedFlight.isValid ? parsedFlight.flightNumber : undefined,
    airportCode,
    isAirportTrip: Boolean(airportDetection.isAirportTrip || parsedFlight.isValid),
    isPrivateAviation: airportDetection.isPrivateAviation,
    corporateAccountNumber,
    poNumber,
    tripId,
    suggestedBooking,
  };
}
