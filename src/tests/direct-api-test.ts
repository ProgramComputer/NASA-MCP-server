import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get API key
const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

// Track failed API calls
const failedCalls: string[] = [];

/**
 * Test function for direct NASA API calls
 */
async function testNasaEndpoint(name: string, url: string, params: Record<string, any> = {}, requiresApiKey: boolean = true) {
  try {
    console.log(`Testing ${name}...`);
    
    // Add API key to parameters if required
    const queryParams = { ...params };
    if (requiresApiKey) {
      queryParams.api_key = NASA_API_KEY;
    }
    
    // Make direct request to NASA API
    const response = await axios.get(url, { params: queryParams });
    
    console.log(`✅ ${name} API call successful`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error in ${name}: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    }
    // Add to failed calls list
    failedCalls.push(name);
    return null;
  }
}

/**
 * Run tests for all NASA APIs
 */
async function runDirectTests() {
  console.log("Starting direct NASA API tests...\n");
  
  // Test APOD API
  await testNasaEndpoint(
    "NASA APOD", 
    "https://api.nasa.gov/planetary/apod"
  );
  
  // Test EPIC API
  await testNasaEndpoint(
    "NASA EPIC",
    "https://epic.gsfc.nasa.gov/api/natural/images",
    {},
    false // EPIC API doesn't use API key in the URL
  );
  
  // Test NEO API
  await testNasaEndpoint(
    "NASA NEO", 
    "https://api.nasa.gov/neo/rest/v1/feed",
    { start_date: "2023-01-01", end_date: "2023-01-07" }
  );
  
  // Test EONET API
  await testNasaEndpoint(
    "NASA EONET", 
    "https://eonet.gsfc.nasa.gov/api/v3/events",
    { limit: 5 },
    false // EONET doesn't require an API key
  );
  
  // Test Mars Rover API
  await testNasaEndpoint(
    "Mars Rover", 
    "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos",
    { sol: 1000, page: 1 }
  );
  
  // Test GIBS API (this is a tile service that returns images)
  await testNasaEndpoint(
    "NASA GIBS",
    "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2023-01-01/250m/6/13/12.jpg",
    {},
    false // GIBS doesn't require an API key
  );
  
  // Test CMR API
  await testNasaEndpoint(
    "NASA CMR",
    "https://cmr.earthdata.nasa.gov/search/collections.json",
    { keyword: "temperature", page_size: 5 },
    false // CMR doesn't use the api_key parameter
  );
  
  // Test FIRMS API 
  await testNasaEndpoint(
    "NASA FIRMS",
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/d67d279bd65f48d0602c9a9cff39fee9", // Token in URL
    { lat: 37.454, lon: -122.181, radius: 1.0 },
    false // FIRMS uses token in URL, not as a parameter
  );
  
  // Test NASA Image Library API
  await testNasaEndpoint(
    "NASA Images",
    "https://images-api.nasa.gov/search",
    { q: "moon", media_type: "image" },
    false // Images API doesn't use the api_key parameter
  );
  
  // Test Exoplanet Archive API (doesn't require API key)
  await testNasaEndpoint(
    "Exoplanet Archive",
    "https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
    { 
      query: "SELECT pl_name FROM ps WHERE rownum < 10",
      format: "json" 
    },
    false // Exoplanet Archive doesn't use an API key
  );
  
  // Test JPL SBDB API (doesn't require API key)
  await testNasaEndpoint(
    "JPL SBDB",
    "https://ssd-api.jpl.nasa.gov/sbdb.api",
    { sstr: "Ceres" },
    false // SBDB doesn't use the api_key parameter
  );
  
  // Test JPL Fireball API (doesn't require API key)
  await testNasaEndpoint(
    "JPL Fireball",
    "https://ssd-api.jpl.nasa.gov/fireball.api",
    { limit: 5 },
    false // Fireball API doesn't use the api_key parameter
  );
  
  console.log("\nAll direct API tests completed!");
  
  // Print summary of failed calls
  if (failedCalls.length > 0) {
    console.log("\n❌ Failed API calls:");
    failedCalls.forEach(name => console.log(`- ${name}`));
  } else {
    console.log("\n✅ All API calls were successful!");
  }
}

// Run the tests
runDirectTests().catch(err => {
  console.error("Unhandled error:", err);
}); 