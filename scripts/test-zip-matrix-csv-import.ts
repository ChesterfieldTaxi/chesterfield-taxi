import {
  ZIP_MATRIX_MAX_ROWS,
  coerceValue,
  createDefaultZipColumns,
  addColumn,
  updateColumn,
  validateSchema,
} from '../app/core/services/pricing/zip-matrix-schema.service';
import {
  applyImport,
  buildImportPreview,
  exportZipMatrixCsv,
  inferColumns,
  parseCsv,
} from '../app/core/services/pricing/zip-matrix-csv.service';
import { evaluateZipMatrixFare } from '../app/core/services/pricing/tariff.service';
import type { TariffProfile, ZipMatrixColumn, ZipMatrixRow } from '../app/core/types/tariff';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log('[PASS] ' + name);
  } else {
    failed++;
    console.error('[FAIL] ' + name + (detail ? ' - ' + detail : ''));
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Parser ----------
console.log('--- Parser ---');
assert(eq(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]), 'basic LF');
assert(eq(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]), 'CRLF + trailing newline');
assert(eq(parseCsv('"a,b",c'), [['a,b', 'c']]), 'quoted field with embedded comma');
assert(eq(parseCsv('"say ""hi""",x'), [['say "hi"', 'x']]), 'escaped quotes');
assert(eq(parseCsv('"line1\nline2",x'), [['line1\nline2', 'x']]), 'embedded newline');
assert(eq(parseCsv('\uFEFFZip,Price\n63005,1'), [['Zip', 'Price'], ['63005', '1']]), 'UTF-8 BOM stripped');
assert(eq(parseCsv('a\n1\n\n'), [['a'], ['1']]), 'trailing blank line ignored');
assert(eq(parseCsv('a,,c'), [['a', '', 'c']]), 'empty middle field');

// ---------- Inference ----------
console.log('--- Inference ---');
const roleOf = (header: string) =>
  inferColumns([header], [['x']], [])[0].column?.role;
assert(roleOf('Zip') === 'zip', 'Zip -> zip role');
assert(roleOf('Postal Code') === 'zip', 'Postal Code -> zip role');
assert(roleOf('Price') === 'price', 'Price -> price role');
assert(roleOf('Flat Rate') === 'price', 'Flat Rate -> price role');
assert(roleOf('Agreed Charge') === 'price', 'Agreed Charge -> price role');
assert(roleOf('City') === undefined, 'City -> no role');
const inferred = inferColumns(
  ['Zip', 'City', 'Price', 'Stops', 'Airport', 'Notes'],
  [
    ['63005', 'Chesterfield', '$35.00', '2', 'yes', 'a'],
    ['63011', 'Ballwin', '39.5', '3', 'no', 'b'],
  ]
);
const types = inferred.map((m) => m.column?.type);
assert(eq(types, ['text', 'text', 'currency', 'integer', 'boolean', 'text']), 'type inference', JSON.stringify(types));
const firstRoleOnly = inferColumns(['Zip', 'Postal'], [['63005', '63005']]);
assert(firstRoleOnly[0].column?.role === 'zip' && firstRoleOnly[1].column?.role === undefined, 'first match wins per role');

// ---------- Validation ----------
console.log('--- Validation ---');
const cols = createDefaultZipColumns();
const baseArgs = { existingColumns: cols, existingRows: [] as ZipMatrixRow[], mode: 'replace' as const };
const mapExisting = (headers: string[]) =>
  headers.map((header, csvIndex) => ({
    csvIndex,
    header,
    action: 'existing' as const,
    existingKey: header.toLowerCase(),
  }));
const run = (csvText: string, mode: 'replace' | 'upsert' = 'replace', existingRows: ZipMatrixRow[] = []) =>
  buildImportPreview({ ...baseArgs, mode, existingRows, csvText, mapping: mapExisting(['Zip', 'Price']) });

for (const bad of ['6300', '63005-1234', 'ABCDE']) {
  const p = run(`Zip,Price\n${bad},10`);
  assert(p.summary.invalid === 1 && p.rows.length === 0, `rejects zip "${bad}"`, JSON.stringify(p.errors));
}
const dup = run('Zip,Price\n63005,10\n63005,12');
assert(dup.rows.length === 1 && dup.errors.some((e) => e.line === 3 && /Duplicate/.test(e.message)), 'later duplicate zip is an error');
const badPrice = run('Zip,Price\n63005,abc');
assert(badPrice.summary.invalid === 1, 'non-numeric price rejected');
const missing = run('Zip,Price\n63005,');
assert(missing.errors.some((e) => /required/.test(e.message)), 'missing required value rejected');

const selectCols = addColumn(cols, { label: 'Tier', type: 'select', options: ['Gold', 'Silver'] });
const selPrev = buildImportPreview({
  ...baseArgs,
  existingColumns: selectCols,
  csvText: 'Zip,Price,Tier\n63005,10,Bronze\n63011,12,gold',
  mapping: mapExisting(['Zip', 'Price', 'Tier']),
});
assert(selPrev.errors.length === 1 && selPrev.rows.length === 1 && selPrev.rows[0].values.tier === 'Gold', 'invalid select rejected; case-insensitive match canonicalized', JSON.stringify(selPrev.errors));

let big = 'Zip,Price\n';
for (let i = 0; i < ZIP_MATRIX_MAX_ROWS + 1; i++) big += `${String(10000 + i)},10\n`;
const bigPrev = run(big);
assert(!bigPrev.canApply && bigPrev.rows.length === 0 && bigPrev.errors.some((e) => /maximum/.test(e.message)), '>5,000 rows rejected');
let okBig = 'Zip,Price\n';
for (let i = 0; i < ZIP_MATRIX_MAX_ROWS; i++) okBig += `${String(10000 + i)},10\n`;
assert(run(okBig).rows.length === ZIP_MATRIX_MAX_ROWS, 'exactly 5,000 rows accepted');
let threw = false;
try {
  applyImport({ ...baseArgs, csvText: big, mapping: mapExisting(['Zip', 'Price']) });
} catch {
  threw = true;
}
assert(threw, 'applyImport throws on over-cap file');

assert(validateSchema(cols).length === 0, 'default schema valid');
assert(validateSchema(cols.filter((c) => c.role !== 'zip')).length > 0, 'schema without zip role rejected');
assert(validateSchema(cols.filter((c) => c.role !== 'price')).length > 0, 'schema without price role rejected');
const noPriceMap = buildImportPreview({
  ...baseArgs,
  existingColumns: [],
  csvText: 'Zip,City\n63005,X',
  mapping: inferColumns(['Zip', 'City'], [['63005', 'X']], []),
});
assert(!noPriceMap.canApply, 'import producing schema without price rejected');
assert(coerceValue('currency', '$1,234.50').ok, 'currency coercion strips $ and commas');
assert(updateColumn(cols, 'price', { role: undefined }).length === 2, 'updateColumn keeps columns');

// ---------- Replace vs Upsert ----------
console.log('--- Replace vs Upsert ---');
const existing: ZipMatrixRow[] = [
  { id: 'zip-63005', values: { zip: '63005', price: 10 } },
  { id: 'zip-63011', values: { zip: '63011', price: 20 } },
  { id: 'zip-63017', values: { zip: '63017', price: 30 } },
];
const csv = 'Zip,Price\n63005,10\n63011,25\n63021,40';
const rep = run(csv, 'replace', existing);
assert(eq(rep.summary, { added: 1, updated: 1, unchanged: 1, removed: 1, invalid: 0 }), 'replace summary', JSON.stringify(rep.summary));
assert(rep.rows.length === 3, 'replace yields file rows only');
const ups = run(csv, 'upsert', existing);
assert(eq(ups.summary, { added: 1, updated: 1, unchanged: 1, removed: 0, invalid: 0 }), 'upsert summary', JSON.stringify(ups.summary));
assert(ups.rows.length === 4 && ups.rows.some((r) => r.values.zip === '63017'), 'upsert keeps untouched rows');

// ---------- Round trip ----------
console.log('--- Export round trip ---');
const rtCols: ZipMatrixColumn[] = [
  { key: 'zip', label: 'Zip', type: 'text', role: 'zip', required: true, order: 0 },
  { key: 'city', label: 'City', type: 'text', order: 1 },
  { key: 'price', label: 'Price', type: 'currency', role: 'price', required: true, order: 2 },
  { key: 'stops', label: 'Stops', type: 'integer', order: 3 },
  { key: 'airport', label: 'Airport', type: 'boolean', order: 4 },
];
const rtRows: ZipMatrixRow[] = [
  { id: 'zip-63005', values: { zip: '63005', city: 'Chesterfield, "MO"', price: 35, stops: 2, airport: true } },
  { id: 'zip-63011', values: { zip: '63011', city: 'Ball\nwin', price: 39.5, stops: 3, airport: false } },
];
const exported = exportZipMatrixCsv(rtCols, rtRows);
const recrecords = parseCsv(exported);
const rt = applyImport({
  csvText: exported,
  mapping: inferColumns(recrecords[0], recrecords.slice(1), []),
  existingColumns: [],
  existingRows: [],
  mode: 'replace',
});
assert(eq(rt.zipMatrixColumns, rtCols), 'round trip columns identical', JSON.stringify(rt.zipMatrixColumns));
assert(eq(rt.zipMatrixRows, rtRows), 'round trip rows identical', JSON.stringify(rt.zipMatrixRows));

// ---------- evaluateZipMatrixFare ----------
console.log('--- evaluateZipMatrixFare ---');
const tariff = {
  name: 'Test',
  zipMatrixColumns: createDefaultZipColumns(),
  zipMatrixRows: existing,
} as unknown as TariffProfile;
assert(evaluateZipMatrixFare(tariff, '63005', '63011')?.price === 20, 'dropoff zip match first');
assert(evaluateZipMatrixFare(tariff, '63005', '99999')?.price === 10, 'pickup fallback');
assert(evaluateZipMatrixFare(tariff, '99998', '99999') === null, 'no match -> null');
assert(evaluateZipMatrixFare(tariff, undefined, '63017-1234')?.zip === '63017', 'ZIP+4 trip input matched on first 5');
assert(evaluateZipMatrixFare({ ...tariff, zipMatrixRows: [] }, '63005') === null, 'empty matrix -> null');

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
