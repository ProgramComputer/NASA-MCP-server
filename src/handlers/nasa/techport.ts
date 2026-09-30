import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { htmlToText } from '../../util/html';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo } from '../common';

const SERVICE = 'NASA TechPort API';
/** Project search and lookup need no token; only POST search and saved searches do. */
const TECHPORT_API_BASE_URL = 'https://techport.nasa.gov/api';
const TECHPORT_PROJECT_PAGE = 'https://techport.nasa.gov/projects';
const SEARCH_EXCERPT_CHARS = 400;

export const techportInputSchema = z
  .strictObject({
    query: z.string().trim().min(1).max(200).describe('Search TechPort technology projects, e.g. "solar sail". Results are ordered by relevance.').optional(),
    project_id: z.int().positive().describe('Fetch one project by its TechPort ID, e.g. 94703.').optional(),
    limit: z.int().min(1).max(50).describe('Search mode: how many projects to return (1-50, default 10).').optional()
  })
  .superRefine((args, ctx) => {
    if ((args.query === undefined) === (args.project_id === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'provide exactly one of query or project_id' });
    }
    if (args.project_id !== undefined && args.limit !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['limit'], message: 'limit applies only to query searches' });
    }
  });

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
/** TechPort records carry contact emails; retained resources keep the project data without them. */
function withoutContacts(project: any): any {
  if (!project || typeof project !== 'object') return project;
  const { projectContacts: _projectContacts, programContacts: _programContacts, ...rest } = project;
  return rest;
}

function dates(project: any): string {
  const start = String(project.startDate ?? '').slice(0, 10);
  const end = String(project.endDate ?? '').slice(0, 10);
  return start || end ? `${start || '?'} to ${end || '?'}` : 'dates unknown';
}

function describe(project: any, excerptChars?: number): string {
  const lines = [`## ${project.title ?? 'Untitled'} (project ${project.projectId})`];
  const facts = [project.status, dates(project)];
  if (project.trlBegin !== undefined || project.trlCurrent !== undefined) {
    facts.push(`TRL ${project.trlBegin ?? '?'} start, ${project.trlCurrent ?? '?'} current, ${project.trlEnd ?? '?'} target`);
  }
  lines.push(facts.filter(Boolean).join(' · '));
  const program = project.program;
  if (program?.title) lines.push(`Program: ${program.title}${program.acronym ? ` (${program.acronym})` : ''}`);
  // Project lookups use camelCase keys; search results use snake_case.
  const lead = project.leadOrganization?.organizationName ?? project.leadOrganization?.organization_name;
  if (lead) lines.push(`Lead organization: ${lead}`);
  const directorate = project.responsibleMd?.organization_name;
  if (directorate) lines.push(`Responsible directorate: ${directorate}`);
  if (project.primaryTx?.code) lines.push(`Technology area: ${project.primaryTx.code} ${project.primaryTx.title ?? ''}`.trim());
  const destinations = [project.destinationTypes ?? project.destinationType ?? []].flat().filter((d: unknown) => typeof d === 'string' && d.trim());
  if (destinations.length) lines.push(`Destinations: ${destinations.map((d: string) => d.replace(/_/g, ' ')).join(', ')}`);
  lines.push(`Page: ${TECHPORT_PROJECT_PAGE}/${project.projectId}`);
  for (const [label, html] of [['Description', project.description], ['Benefits', project.benefits]] as const) {
    if (typeof html !== 'string' || !html.trim()) continue;
    let body = htmlToText(html);
    if (excerptChars !== undefined) {
      if (label === 'Benefits') continue;
      if (body.length > excerptChars) body = `${body.slice(0, excerptChars).trimEnd()}…`;
    }
    lines.push('', `${label}: ${body}`);
  }
  return lines.join('\n');
}

export const techportTool = defineTool({
  name: 'nasa_techport',
  title: 'NASA TechPort technology projects',
  description:
    "NASA's technology project inventory (TechPort): search projects by keyword, or fetch one project with its status, dates, program, " +
    'technology readiness levels (TRL), lead organization, description and benefits. No API key needed.',
  inputSchema: techportInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    if (args.project_id !== undefined) {
      const response = await httpRequest(ctx.fetch, { service: SERVICE, url: `${TECHPORT_API_BASE_URL}/projects/${args.project_id}` });
      const data = response.json<{ project?: any }>();
      const source = sourceInfo(ctx, SERVICE, response.url);
      const project = data.project ?? data;
      return {
        content: [boundedText(describe(project), SERVICE, '')],
        resource: { name: `TechPort project ${args.project_id}`, mimeType: 'application/json', text: json({ source, data: withoutContacts(project) }), source }
      };
    }

    const limit = args.limit ?? 10;
    const url = buildUrl(`${TECHPORT_API_BASE_URL}/projects/search`, { query: args.query, limit });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<{ results?: any[]; total?: number }>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const results = (Array.isArray(data.results) ? data.results : []).slice(0, limit);
    const total = data.total ?? results.length;
    const summary = total === 0 ? `No TechPort projects match "${args.query}".` : `${total} TechPort projects match "${args.query}"; showing the ${results.length} most relevant.`;
    return {
      content: [boundedText([summary, ...results.map((project) => describe(project, SEARCH_EXCERPT_CHARS))].join('\n\n'), SERVICE, 'Use a smaller limit.')],
      resource: { name: `TechPort search "${args.query}"`, mimeType: 'application/json', text: json({ source, data: { total, results: results.map(withoutContacts) } }), source }
    };
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */
