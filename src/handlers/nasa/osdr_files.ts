import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { jsonResult, sourceInfo } from '../common';

const SERVICE = 'NASA OSDR API';
const FILES_URL = 'https://osdr.nasa.gov/osdr/data/osd/files';

export const osdrFilesInputSchema = z.strictObject({
  accession_number: z
    .string()
    .trim()
    .regex(/^(OSD-)?\d+$/i, 'must be an OSD study number such as 87 or OSD-87')
    .transform((value) => value.replace(/^OSD-/i, ''))
    .describe('OSD study accession number, e.g. 87 or OSD-87.')
});

export const osdrFilesTool = defineTool({
  name: 'nasa_osdr_files',
  title: 'NASA OSDR study files',
  description: 'List the data files (with download links) for a NASA Open Science Data Repository (OSDR) study.',
  inputSchema: osdrFilesInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const response = await httpRequest(ctx.fetch, {
      service: SERVICE,
      url: `${FILES_URL}/${encodeURIComponent(args.accession_number)}`,
      headers: { Accept: 'application/json' }
    });
    const data = response.json<{ hits?: number }>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const summary = data.hits === 0 ? `No OSDR study matched OSD-${args.accession_number}.` : `OSDR files for OSD-${args.accession_number}.`;
    return jsonResult(SERVICE, summary, data, source, `OSDR files OSD-${args.accession_number}`);
  }
});
