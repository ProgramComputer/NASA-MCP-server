/**
 * MCP Manifest generator
 * This file defines the MCP manifest that describes the available APIs
 */

export interface MCPManifest {
  schema_version: string;
  server_name: string;
  server_version: string;
  description: string;
  endpoints: MCPEndpoint[];
}

export interface MCPEndpoint {
  name: string;
  description: string;
  endpoint: string;
  schema: any;
}

export function getManifest(): MCPManifest {
  return {
    schema_version: '0.1.0',
    server_name: process.env.MCP_SERVER_NAME || 'NASA MCP Server',
    server_version: '1.0.0',
    description: process.env.MCP_DESCRIPTION || 'Model Context Protocol server for NASA APIs',
    endpoints: [
      // NASA APOD API
      {
        name: 'apod',
        description: 'Get the Astronomy Picture of the Day',
        endpoint: '/nasa/apod',
        schema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date of the APOD image to retrieve (YYYY-MM-DD format)'
            },
            hd: {
              type: 'boolean',
              description: 'Whether to return the high definition image'
            },
            count: {
              type: 'integer',
              description: 'If specified, returns that number of random APODs'
            },
            start_date: {
              type: 'string',
              description: 'Start date for a date range (YYYY-MM-DD format)'
            },
            end_date: {
              type: 'string',
              description: 'End date for a date range (YYYY-MM-DD format)'
            },
            thumbs: {
              type: 'boolean',
              description: 'Return thumbnail URLs if the APOD is a video'
            }
          }
        }
      },
      
      // NASA EPIC API
      {
        name: 'epic',
        description: 'Access Earth Polychromatic Imaging Camera data',
        endpoint: '/nasa/epic',
        schema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              description: 'Image collection (natural or enhanced)',
              enum: ['natural', 'enhanced']
            },
            date: {
              type: 'string',
              description: 'Date of the image (YYYY-MM-DD)'
            }
          }
        }
      },
      
      // NASA NEO API
      {
        name: 'searchNEO',
        description: 'Search for near-Earth objects',
        endpoint: '/nasa/neo',
        schema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date for NEO search range (YYYY-MM-DD format)'
            },
            endDate: {
              type: 'string',
              description: 'End date for NEO search range (YYYY-MM-DD format)'
            },
            asteroidId: {
              type: 'string',
              description: 'Specific asteroid ID to look up'
            }
          },
          required: ['startDate', 'endDate']
        }
      },
      
      // NASA EONET API
      {
        name: 'eonet',
        description: 'Access the Earth Observatory Natural Event Tracker',
        endpoint: '/nasa/eonet',
        schema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Event category (e.g. "wildfires", "seaLakeIce", etc.)'
            },
            days: {
              type: 'integer',
              description: 'Number of days to look back for events'
            },
            source: {
              type: 'string',
              description: 'Source of event data'
            },
            status: {
              type: 'string',
              enum: ['open', 'closed', 'all'],
              description: 'Event status'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of events to return'
            }
          }
        }
      },
      
      // Mars Rover API
      {
        name: 'marsRover',
        description: 'Access Mars Rover photos',
        endpoint: '/nasa/mars_rover',
        schema: {
          type: 'object',
          properties: {
            rover: {
              type: 'string',
              description: 'Name of the rover (curiosity, opportunity, spirit, perseverance)',
              enum: ['curiosity', 'opportunity', 'spirit', 'perseverance']
            },
            sol: {
              type: 'integer',
              description: 'Martian sol (day) of the photos'
            },
            earth_date: {
              type: 'string',
              description: 'Earth date of the photos (YYYY-MM-DD format)'
            },
            camera: {
              type: 'string',
              description: 'Rover camera type'
            },
            page: {
              type: 'integer',
              description: 'Page number for pagination'
            }
          },
          required: ['rover']
        }
      },
      
      // DONKI API
      {
        name: 'donki',
        description: 'Access the Space Weather Database Of Notifications, Knowledge, Information (DONKI)',
        endpoint: '/nasa/donki',
        schema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['cme', 'cmea', 'gst', 'ips', 'flr', 'sep', 'mpc', 'rbe', 'hss', 'wsa', 'notifications'],
              description: 'Type of space weather event'
            },
            startDate: {
              type: 'string',
              description: 'Start date for the search (YYYY-MM-DD format)'
            },
            endDate: {
              type: 'string',
              description: 'End date for the search (YYYY-MM-DD format)'
            }
          },
          required: ['type']
        }
      },
      
      // New APIs
      
      // GIBS API
      {
        name: 'gibs',
        description: 'Access Global Imagery Browse Services (GIBS) satellite imagery',
        endpoint: '/nasa/gibs',
        schema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date of imagery to retrieve (YYYY-MM-DD format)'
            },
            layer: {
              type: 'string',
              description: 'The GIBS imagery layer to retrieve'
            },
            resolution: {
              type: 'string',
              description: 'Resolution of the imagery'
            },
            format: {
              type: 'string',
              enum: ['image/png', 'image/jpeg', 'image/tiff'],
              description: 'Format of the imagery'
            },
            tileMatrixSet: {
              type: 'string',
              description: 'The tile matrix set to use'
            },
            bbox: {
              type: 'string',
              description: 'Bounding box for the imagery (minx,miny,maxx,maxy)'
            }
          },
          required: ['layer']
        }
      },
      
      // CMR API
      {
        name: 'cmr',
        description: 'Search NASA\'s Common Metadata Repository for Earth science data',
        endpoint: '/nasa/cmr',
        schema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'Keyword to search for'
            },
            concept_id: {
              type: 'string',
              description: 'Concept ID to search for'
            },
            collection_id: {
              type: 'string',
              description: 'Collection ID to search for'
            },
            temporal: {
              type: 'string',
              description: 'Temporal range to search for (e.g. "2000-01-01T00:00:00Z,2020-01-01T00:00:00Z")'
            },
            point: {
              type: 'string',
              description: 'Point to search for (e.g. "lon,lat")'
            },
            bounding_box: {
              type: 'string',
              description: 'Bounding box to search for (e.g. "minlon,minlat,maxlon,maxlat")'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return'
            },
            offset: {
              type: 'integer',
              description: 'Offset for pagination'
            },
            provider: {
              type: 'string',
              description: 'Provider to search for'
            },
            sort_key: {
              type: 'string',
              description: 'Field to sort by'
            }
          }
        }
      },
      
      // FIRMS API
      {
        name: 'firms',
        description: 'Access Fire Information for Resource Management System (FIRMS) data',
        endpoint: '/nasa/firms',
        schema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              enum: ['VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT'],
              description: 'Source of fire data'
            },
            day_range: {
              type: 'integer',
              description: 'Number of days of data to retrieve (1-10)'
            },
            latitude: {
              type: 'number',
              description: 'Latitude for point-based search'
            },
            longitude: {
              type: 'number',
              description: 'Longitude for point-based search'
            },
            radius: {
              type: 'number',
              description: 'Radius in km for point-based search'
            },
            area: {
              type: 'string',
              description: 'Area name for area-based search'
            },
            format: {
              type: 'string',
              enum: ['csv', 'json', 'geojson'],
              description: 'Output format'
            }
          }
        }
      },
      
      // NASA Image and Video Library API
      {
        name: 'images',
        description: 'Search NASA\'s Image and Video Library',
        endpoint: '/nasa/images',
        schema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Free text search terms to find assets'
            },
            center: {
              type: 'string',
              description: 'NASA center to search for'
            },
            media_type: {
              type: 'string',
              enum: ['image', 'audio', 'video'],
              description: 'Media type to search for'
            },
            nasa_id: {
              type: 'string',
              description: 'Specific NASA ID to retrieve'
            },
            keywords: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Keywords to search for'
            },
            year_start: {
              type: 'integer',
              description: 'Start year for date range filter'
            },
            year_end: {
              type: 'integer',
              description: 'End year for date range filter'
            },
            page: {
              type: 'integer',
              description: 'Page number for pagination'
            },
            page_size: {
              type: 'integer',
              description: 'Number of items per page'
            }
          }
        }
      },
      
      // Exoplanet Archive API
      {
        name: 'exoplanet',
        description: 'Access NASA\'s Exoplanet Archive',
        endpoint: '/nasa/exoplanet',
        schema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['ps', 'pscomppars', 'exomultpars'],
              description: 'Table to query (ps: Planetary Systems, pscomppars: Planetary Systems Composite Parameters, exomultpars: Extended Planet Parameters)'
            },
            select: {
              type: 'string',
              description: 'Columns to select (comma-separated, or * for all)'
            },
            where: {
              type: 'string',
              description: 'WHERE clause for filtering results'
            },
            order: {
              type: 'string',
              description: 'ORDER BY clause for sorting results'
            },
            format: {
              type: 'string',
              enum: ['json', 'csv', 'xml'],
              description: 'Output format'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return'
            }
          }
        }
      },
      
      // JPL SBDB API
      {
        name: 'sbdb',
        description: 'Search the Small-Body Database (SBDB)',
        endpoint: '/jpl/sbdb',
        schema: {
          type: 'object',
          properties: {
            searchName: {
              type: 'string',
              description: 'The name of the small body to search for'
            },
            spkId: {
              type: 'string',
              description: 'The SPK-ID of the small body'
            },
            designation: {
              type: 'string',
              description: 'Designation to search for'
            },
            fullPrecision: {
              type: 'boolean',
              description: 'Return full-precision data'
            }
          }
        }
      },
      
      // JPL Fireball API
      {
        name: 'fireball',
        description: 'Search JPL fireball data',
        endpoint: '/jpl/fireball',
        schema: {
          type: 'object',
          properties: {
            date_min: {
              type: 'string',
              description: 'Minimum date (YYYY-MM-DD format)'
            },
            date_max: {
              type: 'string',
              description: 'Maximum date (YYYY-MM-DD format)'
            },
            energy_min: {
              type: 'number',
              description: 'Minimum energy (kilotons)'
            },
            req_loc: {
              type: 'boolean',
              description: 'Require location data to be included'
            }
          }
        }
      },
      
      // JPL Scout API
      {
        name: 'scout',
        description: 'Access the JPL Scout API for recent/current asteroid hazard assessment',
        endpoint: '/jpl/scout',
        schema: {
          type: 'object',
          properties: {
            orbit_id: {
              type: 'string',
              description: 'Orbit ID for specific asteroid'
            },
            tdes: {
              type: 'string',
              description: 'Temporary designation'
            }
          }
        }
      }
    ]
  };
} 