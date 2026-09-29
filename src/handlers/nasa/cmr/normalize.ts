import type { CmrRecord, SearchType } from './schema';

/* eslint-disable @typescript-eslint/no-explicit-any -- adapters read loosely typed upstream JSON */

type Link = { url: string; type: string | null; title: string | null };

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const strArray = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null;
const unique = (values: string[]): string[] => [...new Set(values)];

/**
 * CMR JSON (Atom-derived) link relations that point at data access, services
 * or browse imagery, e.g. http://esipfed.org/ns/fedsearch/1.1/data#. Matched on
 * the whole last path segment so ".../metadata#" is not mistaken for "data#".
 */
const ACCESS_REL = /\/(data|s3|service|browse)#$/;

function jsonLinks(links: unknown): Link[] | null {
  if (!Array.isArray(links)) return null;
  return links
    .filter((link: any) => typeof link?.href === 'string' && link.inherited !== true && typeof link.rel === 'string' && ACCESS_REL.test(link.rel))
    .map((link: any) => ({ url: link.href, type: ACCESS_REL.exec(link.rel)?.[1] ?? null, title: str(link.title) }));
}

/** UMM RelatedUrl types that point at data access, services or browse imagery. */
const ACCESS_TYPES = new Set(['GET DATA', 'GET DATA VIA DIRECT ACCESS', 'USE SERVICE API', 'GET SERVICE', 'GET RELATED VISUALIZATION']);

function ummLinks(relatedUrls: unknown): Link[] | null {
  if (!Array.isArray(relatedUrls)) return null;
  return relatedUrls
    .filter((link: any) => typeof link?.URL === 'string' && ACCESS_TYPES.has(link.Type))
    .map((link: any) => ({ url: link.URL, type: str(link.Type), title: str(link.Description) }));
}

export function collectionFromJson(entry: any): CmrRecord | null {
  const conceptId = str(entry?.id);
  if (!conceptId) return null;
  return {
    concept_id: conceptId,
    title: str(entry.title) ?? str(entry.dataset_id),
    short_name: str(entry.short_name),
    version: str(entry.version_id),
    provider: str(entry.data_center),
    time_start: str(entry.time_start),
    time_end: str(entry.time_end),
    platforms: strArray(entry.platforms),
    instruments: strArray(entry.instruments),
    processing_level: str(entry.processing_level_id),
    doi: str(entry.doi),
    cloud_hosted: bool(entry.cloud_hosted),
    online_access: bool(entry.online_access_flag),
    links: jsonLinks(entry.links),
    summary: str(entry.summary)
  };
}

function ummCollectionTemporal(extents: unknown): { start: string | null; end: string | null } {
  if (!Array.isArray(extents)) return { start: null, end: null };
  const starts: string[] = [];
  const ends: string[] = [];
  let openEnded = false;
  for (const extent of extents as any[]) {
    for (const range of extent?.RangeDateTimes ?? []) {
      if (str(range?.BeginningDateTime)) starts.push(range.BeginningDateTime);
      if (str(range?.EndingDateTime)) ends.push(range.EndingDateTime);
      else openEnded = true;
    }
    for (const single of extent?.SingleDateTimes ?? []) {
      if (str(single)) {
        starts.push(single);
        ends.push(single);
      }
    }
  }
  const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);
  return {
    start: starts.length ? [...starts].sort(byTime)[0] : null,
    end: openEnded || !ends.length ? null : [...ends].sort(byTime)[ends.length - 1]
  };
}

export function collectionFromUmm(item: any): CmrRecord | null {
  const meta = item?.meta ?? {};
  const umm = item?.umm ?? {};
  const conceptId = str(meta['concept-id']);
  if (!conceptId) return null;
  const platforms = Array.isArray(umm.Platforms) ? umm.Platforms : null;
  const temporal = ummCollectionTemporal(umm.TemporalExtents);
  return {
    concept_id: conceptId,
    title: str(umm.EntryTitle),
    short_name: str(umm.ShortName),
    version: str(umm.Version),
    provider: str(meta['provider-id']),
    time_start: temporal.start,
    time_end: temporal.end,
    platforms: platforms ? unique(platforms.map((p: any) => p?.ShortName).filter((v: unknown): v is string => typeof v === 'string')) : null,
    instruments: platforms
      ? unique(platforms.flatMap((p: any) => (Array.isArray(p?.Instruments) ? p.Instruments : [])).map((i: any) => i?.ShortName).filter((v: unknown): v is string => typeof v === 'string'))
      : null,
    processing_level: str(umm.ProcessingLevel?.Id),
    doi: str(umm.DOI?.DOI),
    cloud_hosted: null,
    online_access: null,
    links: ummLinks(umm.RelatedUrls),
    summary: str(umm.Abstract)
  };
}

export function granuleFromJson(entry: any): CmrRecord | null {
  const conceptId = str(entry?.id);
  if (!conceptId) return null;
  const cloudCover = entry.cloud_cover === undefined || entry.cloud_cover === null ? null : Number(entry.cloud_cover);
  return {
    concept_id: conceptId,
    title: str(entry.title),
    collection_concept_id: str(entry.collection_concept_id),
    provider: str(entry.data_center),
    producer_granule_id: str(entry.producer_granule_id),
    time_start: str(entry.time_start),
    time_end: str(entry.time_end),
    day_night_flag: str(entry.day_night_flag),
    cloud_cover: cloudCover !== null && Number.isFinite(cloudCover) ? cloudCover : null,
    online_access: bool(entry.online_access_flag),
    browse_available: bool(entry.browse_flag),
    links: jsonLinks(entry.links)
  };
}

export function granuleFromUmm(item: any): CmrRecord | null {
  const meta = item?.meta ?? {};
  const umm = item?.umm ?? {};
  const conceptId = str(meta['concept-id']);
  if (!conceptId) return null;
  const range = umm.TemporalExtent?.RangeDateTime;
  const single = str(umm.TemporalExtent?.SingleDateTime);
  const identifiers: any[] = Array.isArray(umm.DataGranule?.Identifiers) ? umm.DataGranule.Identifiers : [];
  return {
    concept_id: conceptId,
    title: str(umm.GranuleUR),
    collection_concept_id: str(meta['collection-concept-id']),
    provider: str(meta['provider-id']),
    producer_granule_id: str(identifiers.find((i) => i?.IdentifierType === 'ProducerGranuleId')?.Identifier),
    time_start: str(range?.BeginningDateTime) ?? single,
    time_end: str(range?.EndingDateTime) ?? single,
    day_night_flag: str(umm.DataGranule?.DayNightFlag),
    cloud_cover: typeof umm.CloudCover === 'number' ? umm.CloudCover : null,
    online_access: null,
    browse_available: null,
    links: ummLinks(umm.RelatedUrls)
  };
}

/** Fields each adapter can never populate (reported when explicitly requested). */
export const UNAVAILABLE_FIELDS: Record<string, readonly string[]> = {
  'collections:json': [],
  'collections:umm_json': ['cloud_hosted', 'online_access'],
  'granules:json': [],
  'granules:umm_json': ['online_access', 'browse_available']
};

export function normalizeRecords(searchType: SearchType, format: 'json' | 'umm_json', body: any): CmrRecord[] {
  if (format === 'json') {
    const entries: unknown[] = Array.isArray(body?.feed?.entry) ? body.feed.entry : [];
    const adapt = searchType === 'collections' ? collectionFromJson : granuleFromJson;
    return entries.map(adapt).filter((r): r is CmrRecord => r !== null);
  }
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
  const adapt = searchType === 'collections' ? collectionFromUmm : granuleFromUmm;
  return items.map(adapt).filter((r): r is CmrRecord => r !== null);
}

/** Number of entries in a JSON/UMM-JSON page, or null if the body has neither shape. */
export function countEntries(format: 'json' | 'umm_json', body: any): number | null {
  if (format === 'json') return Array.isArray(body?.feed?.entry) ? body.feed.entry.length : null;
  return Array.isArray(body?.items) ? body.items.length : null;
}

export function normalizeFacets(body: any): Array<{ name: string; values: Array<{ title: string; count: number | null }> }> {
  const root = body?.feed?.facets ?? body?.facets;
  const groups: any[] = Array.isArray(root?.children) ? root.children : [];
  return groups
    .filter((group) => typeof group?.title === 'string')
    .map((group) => ({
      name: group.title,
      values: (Array.isArray(group.children) ? group.children : [])
        .filter((value: any) => typeof value?.title === 'string')
        .map((value: any) => ({ title: value.title, count: typeof value.count === 'number' ? value.count : null }))
    }));
}

export function selectFields(record: CmrRecord, fields: readonly string[]): CmrRecord {
  const out: Record<string, unknown> = { concept_id: record.concept_id };
  for (const field of fields) {
    if (field in record) out[field] = (record as Record<string, unknown>)[field];
  }
  return out as CmrRecord;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
