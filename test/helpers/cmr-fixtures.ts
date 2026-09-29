/**
 * CMR fixtures modelled on real responses captured from
 * cmr.earthdata.nasa.gov on 2026-09-29 (trimmed, values shortened).
 */
export function jsonCollection(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `C${1000 + index}-TESTPROV`,
    title: `Test Collection ${index}`,
    dataset_id: `Test Collection ${index}`,
    short_name: `TEST_${index}`,
    version_id: '1',
    data_center: 'TESTPROV',
    time_start: '2002-05-31T21:00:00.000Z',
    processing_level_id: '4',
    platforms: ['Aqua', 'Terra'],
    cloud_hosted: true,
    online_access_flag: true,
    summary: 'A long abstract that compact mode leaves out by default.',
    links: [
      { rel: 'http://esipfed.org/ns/fedsearch/1.1/documentation#', hreflang: 'en-US', href: 'https://example.nasa.gov/docs' },
      { rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', hreflang: 'en-US', href: `https://data.example.nasa.gov/${index}`, title: 'Download' }
    ],
    ...overrides
  };
}

export function jsonGranule(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `G${2000 + index}-TESTPROV`,
    title: `granule_${index}.nc`,
    producer_granule_id: `granule_${index}`,
    collection_concept_id: 'C1996881146-POCLOUD',
    data_center: 'POCLOUD',
    time_start: '2026-09-27T21:00:00.000Z',
    time_end: '2026-09-28T21:00:00.000Z',
    day_night_flag: 'UNSPECIFIED',
    cloud_cover: '12.5',
    online_access_flag: true,
    browse_flag: false,
    links: [
      { rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: `https://archive.example.nasa.gov/granule_${index}.nc`, title: 'Download granule' },
      { rel: 'http://esipfed.org/ns/fedsearch/1.1/s3#', href: `s3://bucket/granule_${index}.nc`, title: 'S3' },
      { inherited: true, rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: 'https://search.earthdata.nasa.gov/inherited' }
    ],
    ...overrides
  };
}

export function ummCollection(index: number) {
  return {
    meta: { 'concept-id': `C${3000 + index}-UMMPROV`, 'provider-id': 'UMMPROV', 'revision-id': 7 },
    umm: {
      ShortName: `UMM_${index}`,
      Version: '4.1',
      EntryTitle: `UMM Collection ${index}`,
      Abstract: 'UMM abstract',
      DOI: { DOI: '10.5067/TEST-DOI', Authority: 'https://doi.org' },
      ProcessingLevel: { Id: '4' },
      TemporalExtents: [{ RangeDateTimes: [{ BeginningDateTime: '2002-05-31T21:00:00.000Z' }] }],
      Platforms: [
        { ShortName: 'Aqua', Instruments: [{ ShortName: 'MODIS' }, { ShortName: 'AMSR-E' }] },
        { ShortName: 'Terra', Instruments: [{ ShortName: 'MODIS' }] }
      ],
      RelatedUrls: [
        { URL: 'https://podaac.example/citing', Type: 'VIEW RELATED INFORMATION' },
        { URL: 'https://podaac.example/data', Type: 'GET DATA', Description: 'Data access' }
      ]
    }
  };
}

export function ummGranule(index: number) {
  return {
    meta: { 'concept-id': `G${4000 + index}-UMMPROV`, 'provider-id': 'UMMPROV', 'collection-concept-id': 'C1996881146-POCLOUD' },
    umm: {
      GranuleUR: `umm_granule_${index}`,
      TemporalExtent: { RangeDateTime: { BeginningDateTime: '2002-05-31T21:00:00.000Z', EndingDateTime: '2002-06-01T21:00:00.000Z' } },
      DataGranule: { DayNightFlag: 'Unspecified', Identifiers: [{ IdentifierType: 'ProducerGranuleId', Identifier: `pgid_${index}` }] },
      CloudCover: 3,
      RelatedUrls: [
        { URL: `https://archive.example/umm_${index}.nc`, Type: 'GET DATA', Description: 'Download' },
        { URL: 'https://archive.example/s3credentials', Type: 'VIEW RELATED INFORMATION' }
      ]
    }
  };
}

export function feed(entries: unknown[], facets?: unknown) {
  return { feed: { updated: '2026-09-29T00:00:00Z', id: 'https://cmr.earthdata.nasa.gov/search', title: 'ECHO dataset metadata', entry: entries, ...(facets ? { facets } : {}) } };
}

export const FACETS_V2 = {
  title: 'Browse Collections',
  type: 'group',
  has_children: true,
  children: [
    {
      title: 'Platforms',
      type: 'group',
      children: [
        { title: 'Space-based Platforms', type: 'filter', count: 542, applied: false },
        { title: 'Other', type: 'filter', count: 110, applied: false }
      ]
    }
  ]
};
