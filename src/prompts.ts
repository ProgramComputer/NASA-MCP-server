/**
 * MCP prompts. Each maps its string arguments to arguments for one tool; the
 * legacy "prompts/execute" method runs that tool through the validated path.
 */
export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDefinition {
  name: string;
  /** Older spellings accepted by prompts/get and prompts/execute. */
  aliases: string[];
  description: string;
  arguments: PromptArgument[];
  tool: string;
  toToolArgs(args: Record<string, string>): Record<string, unknown>;
  message(args: Record<string, string>): string;
}

function numberOrText(value: string | undefined): number | string | undefined {
  if (value === undefined || value === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
}

function booleanOrText(value: string | undefined): boolean | string | undefined {
  if (value === undefined || value === '') return undefined;
  if (/^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
  return value;
}

function pick(args: Record<string, string>, mapping: Record<string, (value: string | undefined) => unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, convert] of Object.entries(mapping)) {
    const value = convert(args[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const asText = (value: string | undefined) => (value === undefined || value === '' ? undefined : value);

function describeCall(tool: string, toolArgs: Record<string, unknown>): string {
  return `Use the ${tool} tool with arguments ${JSON.stringify(toolArgs)}.`;
}

const apodArgs = (args: Record<string, string>) =>
  pick(args, { date: asText, count: numberOrText, start_date: asText, end_date: asText, thumbs: booleanOrText });

export const PROMPTS: PromptDefinition[] = [
  {
    name: 'nasa/get-astronomy-picture',
    aliases: [],
    description: "Fetch NASA's Astronomy Picture of the Day with optional date selection",
    arguments: [
      { name: 'date', description: 'Date of the picture (YYYY-MM-DD)', required: false },
      { name: 'count', description: 'Number of random pictures', required: false },
      { name: 'start_date', description: 'Start of a date range (YYYY-MM-DD)', required: false },
      { name: 'end_date', description: 'End of a date range (YYYY-MM-DD)', required: false },
      { name: 'thumbs', description: 'Include video thumbnails (true/false)', required: false }
    ],
    tool: 'nasa_apod',
    toToolArgs: apodArgs,
    message: (args) => describeCall('nasa_apod', apodArgs(args))
  },
  {
    name: 'nasa/browse-near-earth-objects',
    aliases: [],
    description: 'Find near-Earth asteroids within a date range (up to 7 days)',
    arguments: [
      { name: 'start_date', description: 'Start date (YYYY-MM-DD)', required: true },
      { name: 'end_date', description: 'End date (YYYY-MM-DD)', required: true }
    ],
    tool: 'nasa_neo',
    toToolArgs: (args) => pick(args, { start_date: asText, end_date: asText }),
    message: (args) => describeCall('nasa_neo', pick(args, { start_date: asText, end_date: asText }))
  },
  {
    name: 'nasa/view-epic-imagery',
    aliases: [],
    description: 'Browse Earth Polychromatic Imaging Camera views of Earth',
    arguments: [
      { name: 'collection', description: "Image collection ('natural' or 'enhanced')", required: false },
      { name: 'date', description: 'Date of images (YYYY-MM-DD)', required: false }
    ],
    tool: 'nasa_epic',
    toToolArgs: (args) => pick(args, { collection: asText, date: asText }),
    message: (args) => describeCall('nasa_epic', pick(args, { collection: asText, date: asText }))
  },
  {
    name: 'jpl_query-small-body-database',
    aliases: ['jpl/query-small-body-database'],
    description: 'Look up an asteroid or comet in the JPL Small-Body Database',
    arguments: [
      { name: 'object_name', description: "Name or designation (e.g. 'Ceres')", required: false },
      { name: 'spk_id', description: 'SPK-ID of the object', required: false }
    ],
    tool: 'jpl_sbdb',
    toToolArgs: (args) => pick({ sstr: args.object_name, spk: args.spk_id } as Record<string, string>, { sstr: asText, spk: numberOrText }),
    message: (args) => describeCall('jpl_sbdb', pick({ sstr: args.object_name, spk: args.spk_id } as Record<string, string>, { sstr: asText, spk: numberOrText }))
  },
  {
    name: 'jpl_find-close-approaches',
    aliases: ['jpl/find-close-approaches'],
    description: 'Find close approaches of asteroids and comets to Earth or other planets',
    arguments: [
      { name: 'dist_max', description: 'Maximum distance, e.g. 0.05 (au) or 10LD', required: false },
      { name: 'date_min', description: 'Start date (YYYY-MM-DD)', required: false },
      { name: 'date_max', description: 'End date (YYYY-MM-DD)', required: false },
      { name: 'body', description: 'Body (default Earth)', required: false }
    ],
    tool: 'jpl_cad',
    toToolArgs: (args) => pick(args, { dist_max: asText, date_min: asText, date_max: asText, body: asText }),
    message: (args) => describeCall('jpl_cad', pick(args, { dist_max: asText, date_min: asText, date_max: asText, body: asText }))
  },
  {
    name: 'jpl_get-fireball-data',
    aliases: ['jpl/get-fireball-data'],
    description: 'Retrieve fireball events detected by US Government sensors',
    arguments: [
      { name: 'date_min', description: 'Start date (YYYY-MM-DD)', required: false },
      { name: 'date_max', description: 'End date (YYYY-MM-DD)', required: false },
      { name: 'energy_min', description: 'Minimum radiated energy (1e10 J)', required: false }
    ],
    tool: 'jpl_fireball',
    toToolArgs: (args) => pick(args, { date_min: asText, date_max: asText, energy_min: numberOrText }),
    message: (args) => describeCall('jpl_fireball', pick(args, { date_min: asText, date_max: asText, energy_min: numberOrText }))
  },
  {
    name: 'apod-daily',
    aliases: [],
    description: "Get NASA's Astronomy Picture of the Day with a natural language prompt",
    arguments: [
      { name: 'date', description: 'Date of the picture (YYYY-MM-DD)', required: false },
      { name: 'count', description: 'Number of random pictures', required: false },
      { name: 'start_date', description: 'Start of a date range (YYYY-MM-DD)', required: false },
      { name: 'end_date', description: 'End of a date range (YYYY-MM-DD)', required: false }
    ],
    tool: 'nasa_apod',
    toToolArgs: apodArgs,
    message: (args) =>
      `Show me the NASA Astronomy Picture of the Day${args.date ? ` for ${args.date}` : ''}${args.count ? ` (${args.count} random images)` : ''}` +
      `${args.start_date && args.end_date ? ` from ${args.start_date} to ${args.end_date}` : ''}.`
  }
];

export function findPrompt(name: string): PromptDefinition | undefined {
  return PROMPTS.find((prompt) => prompt.name === name || prompt.aliases.includes(name));
}

export function missingPromptArguments(prompt: PromptDefinition, args: Record<string, string>): string[] {
  return prompt.arguments.filter((arg) => arg.required && !args[arg.name]).map((arg) => arg.name);
}
