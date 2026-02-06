/**
 * Test script to verify Ashby job data extraction
 * Run with: npx tsx scripts/test-ashby-api.ts
 */

const ORG_SLUG = "spellbook.legal";

interface AshbyJobPosting {
  id: string;
  title: string;
  updatedAt: string;
  departmentName: string;
  locationName: string;
  workplaceType: string;
  employmentType: string;
  publishedDate: string;
  teamName: string;
}

interface AshbyAppData {
  organization: {
    name: string;
    publicWebsite: string;
    hostedJobsPageSlug: string;
  };
  jobBoard: {
    teams: Array<{ id: string; name: string }>;
    jobPostings: AshbyJobPosting[];
  };
}

async function fetchAshbyJobs(orgSlug: string): Promise<AshbyAppData> {
  const url = `https://jobs.ashbyhq.com/${orgSlug}`;
  console.log(`Fetching: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ashby page error: ${response.status} ${response.statusText}`);
  }
  
  const html = await response.text();
  
  // Extract __appData from the HTML
  const match = html.match(/window\.__appData\s*=\s*({[\s\S]*?});/);
  if (!match) {
    throw new Error("Could not find __appData in page");
  }
  
  return JSON.parse(match[1]);
}

async function fetchAshbyJobDetails(orgSlug: string, jobId: string): Promise<any> {
  const url = `https://jobs.ashbyhq.com/${orgSlug}/${jobId}`;
  console.log(`Fetching job details: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ashby job page error: ${response.status} ${response.statusText}`);
  }
  
  const html = await response.text();
  
  // Extract __appData from the HTML
  const match = html.match(/window\.__appData\s*=\s*({[\s\S]*?});/);
  if (!match) {
    throw new Error("Could not find __appData in page");
  }
  
  return JSON.parse(match[1]);
}

async function main() {
  console.log(`\n=== Testing Ashby for ${ORG_SLUG} ===\n`);
  
  try {
    const data = await fetchAshbyJobs(ORG_SLUG);
    
    console.log(`Organization: ${data.organization.name}`);
    console.log(`Website: ${data.organization.publicWebsite}`);
    console.log(`Total jobs: ${data.jobBoard.jobPostings.length}\n`);
    
    console.log(`Teams: ${data.jobBoard.teams.map(t => t.name).join(", ")}\n`);
    
    // Show first 5 jobs
    for (const job of data.jobBoard.jobPostings.slice(0, 5)) {
      console.log(`---`);
      console.log(`Title: ${job.title}`);
      console.log(`ID: ${job.id}`);
      console.log(`Department: ${job.departmentName}`);
      console.log(`Team: ${job.teamName}`);
      console.log(`Location: ${job.locationName}`);
      console.log(`Workplace: ${job.workplaceType}`);
      console.log(`Published: ${job.publishedDate}`);
      console.log(`Updated: ${job.updatedAt}`);
      console.log("");
    }
    
    // Fetch details for the first Engineering job
    const engJob = data.jobBoard.jobPostings.find(j => j.departmentName === "Engineering");
    if (engJob) {
      console.log(`\n=== Fetching details for: ${engJob.title} ===\n`);
      const details = await fetchAshbyJobDetails(ORG_SLUG, engJob.id);
      
      if (details.posting?.descriptionHtml) {
        const textPreview = details.posting.descriptionHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
        console.log(`Description preview: ${textPreview}...`);
        
        // Try to extract technologies mentioned
        const techKeywords = [
          "React", "TypeScript", "JavaScript", "Python", "Node.js", "AWS", 
          "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "GraphQL",
          "C#", ".NET", "Java", "Go", "Rust", "Ruby", "Rails", "Vue",
          "Angular", "Next.js", "Terraform", "CI/CD", "Git", "Redis",
          "Elasticsearch", "Machine Learning", "AI", "LLM"
        ];
        
        const foundTechs = techKeywords.filter(tech => 
          details.posting.descriptionHtml.toLowerCase().includes(tech.toLowerCase())
        );
        
        if (foundTechs.length > 0) {
          console.log(`\nTechnologies mentioned: ${foundTechs.join(", ")}`);
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
