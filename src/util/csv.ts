export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export interface CsvTable {
  header: string[];
  rows: string[][];
}

/**
 * RFC 4180 CSV parser: quoted fields, doubled quotes, embedded delimiters and
 * newlines, CRLF or LF line endings, optional BOM and trailing newline.
 * Throws {@link CsvParseError} on unterminated quotes or ragged rows.
 */
export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    const lastFieldQuoted = fieldWasQuoted;
    endField();
    // Skip completely blank lines (a single empty unquoted field).
    if (!(record.length === 1 && record[0] === '' && !lastFieldQuoted)) {
      records.push(record);
    }
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) {
        throw new CsvParseError(`Unexpected quote inside unquoted field on record ${records.length + 1}`);
      }
      inQuotes = true;
      fieldWasQuoted = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) {
    throw new CsvParseError('Unterminated quoted field');
  }
  if (field.length > 0 || record.length > 0 || fieldWasQuoted) {
    endRecord();
  }

  if (records.length === 0) {
    return { header: [], rows: [] };
  }
  const [header, ...rows] = records;
  rows.forEach((row, index) => {
    if (row.length !== header.length) {
      throw new CsvParseError(`Record ${index + 2} has ${row.length} fields; expected ${header.length}`);
    }
  });
  return { header, rows };
}
