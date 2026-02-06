/**
 * One-time import script to seed technologies from getcoding-list.json
 * 
 * Run with: npx tsx scripts/import-technologies.ts
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// Technology to category mapping
const techCategories: Record<string, string> = {
  // Languages
  "C": "language",
  "C++": "language",
  "C#": "language",
  "F#": "language",
  "GLSL": "language",
  "HLSL": "language",
  "Java": "language",
  "JavaScript": "language",
  "Objective-C": "language",
  "Perl": "language",
  "PHP": "language",
  "Python": "language",
  "R": "language",
  "Ruby": "language",
  "SQL": "language",
  "TypeScript": "language",
  
  // Frontend
  "Angular": "frontend",
  "Blazor": "frontend",
  "Flutter": "frontend",
  "React": "frontend",
  "React Native": "frontend",
  
  // Backend
  ".NET": "backend",
  "ASP.NET Core": "backend",
  "FastAPI": "backend",
  "Flask": "backend",
  "Laravel": "backend",
  "Node.js": "backend",
  "Vert.x": "backend",
  
  // Cloud
  "AWS": "cloud",
  "Azure": "cloud",
  "GCP": "cloud",
  
  // Databases
  "DynamoDB": "database",
  "Elasticsearch": "database",
  "Firebase": "database",
  "MariaDB": "database",
  "MongoDB": "database",
  "MySQL": "database",
  "Neo4j": "database",
  "PostgreSQL": "database",
  "Redis": "database",
  
  // DevOps
  "Ansible": "devops",
  "CircleCI": "devops",
  "Docker": "devops",
  "GitLab CI": "devops",
  "Kubernetes": "devops",
  "Serverless": "devops",
  "Terraform": "devops",
  
  // Game Engines / Graphics
  "Blender": "game-engine",
  "DirectX": "game-engine",
  "Metal": "game-engine",
  "OpenGL": "game-engine",
  "Unity": "game-engine",
  "Unreal Engine": "game-engine",
  "Vulkan": "game-engine",
  
  // Mobile
  "Android Studio": "mobile",
  "Cordova": "mobile",
  "Ionic": "mobile",
  "Xamarin": "mobile",
  "Xcode": "mobile",
  
  // Data Science
  "CUDA": "data-science",
  "Databricks": "data-science",
  "Jupyter": "data-science",
  "TensorFlow": "data-science",
  
  // Platforms
  "GraphQL": "platform",
  "Salesforce": "platform",
  "Storybook": "platform",
  "Webflow": "platform",
  "WordPress": "platform",
  
  // Specialized
  "AR/VR": "specialized",
  "HLA 1.3": "specialized",
  "MATLAB": "specialized",
  "Moodle": "specialized",
  "ProseMirror": "specialized",
  "Qt": "specialized",
  "ROS": "specialized",
  "WPF": "specialized",
};

function generateSlug(name: string): string {
  // Special cases for technologies with problematic names
  const specialSlugs: Record<string, string> = {
    "C": "c-lang",
    "C++": "cpp",
    "C#": "csharp",
    "F#": "fsharp",
    ".NET": "dotnet",
    "ASP.NET Core": "aspnet-core",
    "Node.js": "nodejs",
    "React Native": "react-native",
    "AR/VR": "ar-vr",
    "HLA 1.3": "hla-13",
  };
  
  if (specialSlugs[name]) {
    return specialSlugs[name];
  }
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  // Load the JSON data
  const jsonPath = path.join(process.cwd(), "getcoding-list.json");
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  
  // Open the database
  const dbPath = process.env.DB_URL || path.join(process.cwd(), "data/siliconharbour.db");
  const db = new Database(dbPath);
  
  console.log("Starting technology import...\n");
  
  // Step 1: Insert all unique technologies
  const allTechs = new Set<string>();
  for (const entry of Object.values(jsonData) as any[]) {
    if (entry.technologies) {
      for (const tech of entry.technologies) {
        allTechs.add(tech);
      }
    }
  }
  
  console.log(`Found ${allTechs.size} unique technologies\n`);
  
  // Insert technologies
  const insertTech = db.prepare(`
    INSERT OR IGNORE INTO technologies (slug, name, category, visible, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  
  const now = Date.now();
  let techInserted = 0;
  
  for (const techName of allTechs) {
    const category = techCategories[techName];
    if (!category) {
      console.warn(`  WARNING: No category for "${techName}", skipping`);
      continue;
    }
    
    const slug = generateSlug(techName);
    try {
      insertTech.run(slug, techName, category, now, now);
      techInserted++;
    } catch (err: any) {
      if (!err.message.includes("UNIQUE constraint failed")) {
        console.error(`  Error inserting "${techName}":`, err.message);
      }
    }
  }
  
  console.log(`Inserted ${techInserted} technologies\n`);
  
  // Step 2: Create technology ID lookup
  const techRows = db.prepare("SELECT id, name FROM technologies").all() as { id: number; name: string }[];
  const techIdByName: Record<string, number> = {};
  for (const row of techRows) {
    techIdByName[row.name] = row.id;
  }
  
  // Step 3: Get company ID lookup by slug
  const companyRows = db.prepare("SELECT id, slug FROM companies").all() as { id: number; slug: string }[];
  const companyIdBySlug: Record<string, number> = {};
  for (const row of companyRows) {
    companyIdBySlug[row.slug] = row.id;
  }
  
  // Step 4: Create assignments
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO technology_assignments (technology_id, content_type, content_id, source, source_url, last_verified, created_at)
    VALUES (?, 'company', ?, ?, ?, ?, ?)
  `);
  
  let assignmentsCreated = 0;
  let companiesMatched = 0;
  let companiesMissing = 0;
  
  for (const [slug, entry] of Object.entries(jsonData) as [string, any][]) {
    // Skip missing companies
    if (slug.startsWith("missing-")) {
      console.log(`  Skipping missing company: ${entry.originalName}`);
      companiesMissing++;
      continue;
    }
    
    const companyId = companyIdBySlug[slug];
    if (!companyId) {
      console.warn(`  WARNING: Company slug "${slug}" not found in database`);
      companiesMissing++;
      continue;
    }
    
    companiesMatched++;
    
    if (!entry.technologies || entry.technologies.length === 0) {
      continue;
    }
    
    for (const techName of entry.technologies) {
      const techId = techIdByName[techName];
      if (!techId) {
        console.warn(`    WARNING: Technology "${techName}" not found for ${slug}`);
        continue;
      }
      
      try {
        insertAssignment.run(
          techId,
          companyId,
          entry.source,
          entry.sourceUrl,
          entry.lastUpdated,
          now
        );
        assignmentsCreated++;
      } catch (err: any) {
        if (!err.message.includes("UNIQUE constraint failed")) {
          console.error(`    Error assigning ${techName} to ${slug}:`, err.message);
        }
      }
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`  Technologies: ${techInserted} inserted`);
  console.log(`  Companies matched: ${companiesMatched}`);
  console.log(`  Companies missing: ${companiesMissing}`);
  console.log(`  Assignments created: ${assignmentsCreated}`);
  
  db.close();
}

main().catch(console.error);
