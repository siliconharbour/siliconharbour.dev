/**
 * Test script to verify Greenhouse API access
 * Run with: npx tsx scripts/test-greenhouse-api.ts
 */

const BOARD_TOKEN = "colabsoftware";
const API_BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJob {
  id: number;
  internal_job_id: number;
  title: string;
  updated_at: string;
  requisition_id: string | null;
  location: {
    name: string;
  };
  absolute_url: string;
  content?: string;
  departments?: Array<{
    id: number;
    name: string;
  }>;
  offices?: Array<{
    id: number;
    name: string;
    location: string;
  }>;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

async function fetchGreenhouseJobs(boardToken: string, includeContent: boolean = true): Promise<GreenhouseResponse> {
  const url = `${API_BASE}/${boardToken}/jobs${includeContent ? "?content=true" : ""}`;
  console.log(`Fetching: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Greenhouse API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  console.log(`\n=== Testing Greenhouse API for ${BOARD_TOKEN} ===\n`);
  
  try {
    const data = await fetchGreenhouseJobs(BOARD_TOKEN);
    
    console.log(`Total jobs: ${data.meta.total}\n`);
    
    for (const job of data.jobs) {
      console.log(`---`);
      console.log(`Title: ${job.title}`);
      console.log(`ID: ${job.id} (internal: ${job.internal_job_id})`);
      console.log(`Location: ${job.location.name}`);
      console.log(`URL: ${job.absolute_url}`);
      console.log(`Updated: ${job.updated_at}`);
      
      if (job.departments && job.departments.length > 0) {
        console.log(`Department: ${job.departments.map(d => d.name).join(", ")}`);
      }
      
      if (job.content) {
        // Extract plain text from HTML for preview
        const textPreview = job.content
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);
        console.log(`Description preview: ${textPreview}...`);
        
        // Try to extract technologies mentioned
        const techKeywords = [
          "React", "TypeScript", "JavaScript", "Python", "Node.js", "AWS", 
          "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "GraphQL",
          "C#", ".NET", "Java", "Go", "Rust", "Ruby", "Rails", "Vue",
          "Angular", "Next.js", "Terraform", "CI/CD", "Git"
        ];
        
        const foundTechs = techKeywords.filter(tech => 
          job.content!.toLowerCase().includes(tech.toLowerCase())
        );
        
        if (foundTechs.length > 0) {
          console.log(`Technologies mentioned: ${foundTechs.join(", ")}`);
        }
      }
      console.log("");
    }
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
