import { db } from "../app/db";
import {
  companies,
  events,
  eventDates,
  eventOccurrences,
  groups,
  education,
  people,
  news,
  jobs,
  projects,
  projectImages,
  references,
} from "../app/db/schema";
import { createCompany } from "../app/lib/companies.server";
import { createEvent } from "../app/lib/events.server";
import { createGroup } from "../app/lib/groups.server";
import { createEducation } from "../app/lib/education.server";
import { createPerson } from "../app/lib/people.server";
import { createNews } from "../app/lib/news.server";
import { createJob } from "../app/lib/jobs.server";
import { createProject } from "../app/lib/projects.server";
import { stringifyProjectLinks } from "../app/lib/project-links";

const args = process.argv.slice(2);
const forceReset = args.includes("--force");

async function checkEmpty(): Promise<boolean> {
  const companyCount = await db.select().from(companies);
  const eventCount = await db.select().from(events);
  const groupCount = await db.select().from(groups);
  const educationCount = await db.select().from(education);
  const peopleCount = await db.select().from(people);
  const newsCount = await db.select().from(news);
  const jobCount = await db.select().from(jobs);
  const projectCount = await db.select().from(projects);

  return (
    companyCount.length === 0 &&
    eventCount.length === 0 &&
    groupCount.length === 0 &&
    educationCount.length === 0 &&
    peopleCount.length === 0 &&
    newsCount.length === 0 &&
    jobCount.length === 0 &&
    projectCount.length === 0
  );
}

async function clearAllData(): Promise<void> {
  console.log("Clearing existing data...");
  await db.delete(references);
  await db.delete(eventOccurrences);
  await db.delete(eventDates);
  await db.delete(events);
  await db.delete(projectImages);
  await db.delete(projects);
  await db.delete(companies);
  await db.delete(groups);
  await db.delete(education);
  await db.delete(people);
  await db.delete(news);
  await db.delete(jobs);
}

// Helper to create dates relative to now
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 0, 0, 0); // Default to 6 PM
  return date;
}

function hoursFromDate(date: Date, hours: number): Date {
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
}

async function seedCompanies() {
  console.log("Seeding companies...");

  const companiesData = [
    {
      name: "Verafin",
      description:
        "Verafin is a leading provider of cloud-based financial crime management solutions. Founded in St. John's, the company has grown to become one of the largest tech employers in the province, with their software helping financial institutions detect and report money laundering, fraud, and other financial crimes.",
      website: "https://verafin.com",
      location: "St. John's, NL",
      founded: "2003",
    },
    {
      name: "CoLab Software",
      description:
        "CoLab is a design review platform built for engineers. Their software helps engineering teams collaborate on complex CAD designs, streamlining the review process and reducing costly design errors. The company has raised significant venture funding and continues to grow their St. John's team.",
      website: "https://colabsoftware.com",
      location: "St. John's, NL",
      founded: "2017",
    },
    {
      name: "HeyOrca",
      description:
        "HeyOrca is a social media scheduling and approval platform designed for marketing agencies. Built and headquartered in St. John's, the platform helps agencies manage multiple client accounts and streamline their content approval workflows.",
      website: "https://heyorca.com",
      location: "St. John's, NL",
      founded: "2016",
    },
    {
      name: "Mysa",
      description:
        "Mysa creates smart thermostats for electric heating systems. Their beautiful, intuitive devices help homeowners save energy and money while maintaining comfort. Designed and engineered in Newfoundland, Mysa has become a leader in the smart home space.",
      website: "https://getmysa.com",
      location: "St. John's, NL",
      founded: "2015",
    },
    {
      name: "Sequence Bio",
      description:
        "Sequence Bio is a biotechnology company combining genomics research with Newfoundland's unique population history. They're building one of the world's most comprehensive health databases to accelerate drug discovery and personalized medicine.",
      website: "https://sequencebio.com",
      location: "St. John's, NL",
      founded: "2018",
    },
    {
      name: "Clockwork Fox Studios",
      description:
        "An indie game development studio based in St. John's, creating unique and engaging gaming experiences. The team focuses on narrative-driven games with distinctive art styles.",
      website: "https://clockworkfoxstudios.com",
      location: "St. John's, NL",
      founded: "2019",
    },
    {
      name: "Bluedrop ISM",
      description:
        "Bluedrop ISM provides innovative learning and talent management solutions. Their platforms serve enterprise clients, educational institutions, and government organizations with simulation-based training and e-learning solutions.",
      website: "https://bluedrop.com",
      location: "St. John's, NL",
      founded: "1992",
    },
    {
      name: "Solace Power",
      description:
        "Solace Power develops wireless power transfer technology for industrial and consumer applications. Their innovative solutions enable efficient power delivery without physical connections, opening new possibilities for robotics, IoT, and consumer electronics.",
      website: "https://solace.ca",
      location: "Mount Pearl, NL",
      founded: "2011",
    },
    {
      name: "East Coast Trail Association",
      description:
        "While primarily a non-profit, ECTA has a growing tech team building digital solutions for trail management, mapping, and visitor engagement. They maintain apps and systems that help thousands of hikers explore Newfoundland's iconic coastline.",
      website: "https://eastcoasttrail.com",
      location: "St. John's, NL",
      founded: "1994",
    },
    {
      name: "Kraken Robotics",
      description:
        "Kraken Robotics designs and manufactures advanced sensors, software, and underwater robotic systems. Their technology is used for ocean exploration, offshore energy, and defense applications worldwide.",
      website: "https://krakenrobotics.com",
      location: "Mount Pearl, NL",
      founded: "2012",
    },
  ];

  for (const company of companiesData) {
    await createCompany(company);
  }

  console.log(`  Created ${companiesData.length} companies`);
}

async function seedGroups() {
  console.log("Seeding groups...");

  const groupsData = [
    {
      name: "NL Tech",
      description:
        "The largest tech community in Newfoundland and Labrador. NL Tech brings together developers, designers, entrepreneurs, and tech enthusiasts through regular meetups, workshops, and social events. Join our Slack for daily discussions!",
      website: "https://nltech.ca",
      meetingFrequency: "Monthly meetups",
    },
    {
      name: "St. John's JavaScript",
      description:
        "A community of JavaScript developers in St. John's. We cover everything from vanilla JS to modern frameworks like React, Vue, and Node.js. All skill levels welcome - come learn, share, and connect with fellow JS enthusiasts.",
      website: "https://meetup.com/stjohns-javascript",
      meetingFrequency: "Bi-weekly",
    },
    {
      name: "Women in Tech NL",
      description:
        "Supporting and empowering women in Newfoundland and Labrador's technology sector. We provide mentorship, networking opportunities, and professional development resources for women at all stages of their tech careers.",
      website: "https://womenintechnl.ca",
      meetingFrequency: "Monthly",
    },
    {
      name: "NL Game Developers",
      description:
        "A community for game developers in Newfoundland and Labrador. Whether you're into Unity, Unreal, Godot, or building your own engine, join us to share your projects, get feedback, and collaborate with other game devs.",
      website: "https://discord.gg/nlgamedev",
      meetingFrequency: "Monthly game jams",
    },
    {
      name: "Data Science NL",
      description:
        "Exploring data science, machine learning, and AI in Newfoundland and Labrador. We host talks, workshops, and study groups covering everything from Python basics to advanced deep learning techniques.",
      website: "https://meetup.com/datasciencenl",
      meetingFrequency: "Monthly",
    },
    {
      name: "Startup St. John's",
      description:
        "Supporting early-stage founders and entrepreneurs in St. John's. We connect startups with mentors, investors, and resources to help them grow. Regular pitch nights and founder meetups throughout the year.",
      website: "https://startupstjohns.ca",
      meetingFrequency: "Bi-weekly coffee chats",
    },
  ];

  for (const group of groupsData) {
    await createGroup(group);
  }

  console.log(`  Created ${groupsData.length} groups`);
}

async function seedEducation() {
  console.log("Seeding education resources...");

  const educationData = [
    {
      name: "Memorial University - Computer Science",
      description:
        "Memorial University's Department of Computer Science offers undergraduate and graduate programs in computer science. Programs include BSc, MSc, and PhD options with research areas in AI, data science, software engineering, and more.",
      website: "https://mun.ca/computerscience",
      type: "university" as const,
    },
    {
      name: "College of the North Atlantic - IT Programs",
      description:
        "CNA offers practical, hands-on technology programs including Software Development, Networking, and IT Support. Programs are designed with industry input to ensure graduates have job-ready skills.",
      website: "https://cna.nl.ca",
      type: "college" as const,
    },
    {
      name: "Keyin College - Software Development",
      description:
        "Keyin College's Software Development program provides intensive training in modern web and mobile development. The accelerated format helps career changers enter the tech industry quickly.",
      website: "https://keyin.ca",
      type: "bootcamp" as const,
    },
    {
      name: "Genesis Centre",
      description:
        "Genesis is a startup incubator and accelerator that provides entrepreneurship education, mentorship, and resources. Their programs help tech founders develop business skills alongside their technical abilities.",
      website: "https://genesis.mun.ca",
      type: "other" as const,
    },
    {
      name: "freeCodeCamp St. John's Study Group",
      description:
        "A local study group working through freeCodeCamp's free online curriculum together. We meet weekly to learn web development, help each other with challenges, and build projects as a community.",
      website: "https://freecodecamp.org",
      type: "online" as const,
    },
  ];

  for (const item of educationData) {
    await createEducation(item);
  }

  console.log(`  Created ${educationData.length} education resources`);
}

async function seedPeople() {
  console.log("Seeding people...");

  const peopleData = [
    {
      name: "Sarah Mitchell",
      bio: "[[{Full-stack Developer} at {CoLab Software}]] and [[{Organizer} at {St. John's JavaScript}]]. Passionate about React, TypeScript, and building great developer experiences.",
      website: "https://sarahmitchell.dev",
      socialLinks: JSON.stringify({
        twitter: "sarahcodes",
        github: "sarahmitchell",
        linkedin: "sarahmitchelldev",
      }),
    },
    {
      name: "James Walsh",
      bio: "[[{CTO} at {Verafin}]] and co-founder at a local startup. Interested in distributed systems, fintech, and mentoring new developers.",
      website: "https://jameswalsh.ca",
      socialLinks: JSON.stringify({
        twitter: "jwalshtech",
        linkedin: "jameswalshnl",
      }),
    },
    {
      name: "Emily Chen",
      bio: "[[{Data Scientist} at {Sequence Bio}]] working on genomics and personalized medicine. PhD from [[Memorial University - Computer Science]]. [[{Organizer} at {Data Science NL}]].",
      socialLinks: JSON.stringify({
        github: "emilychen-ds",
        linkedin: "emilychends",
      }),
    },
    {
      name: "Mike O'Brien",
      bio: "Game developer and [[{Founder} at {Clockwork Fox Studios}]]. Makes indie games with heart. Active in [[NL Game Developers]] community.",
      website: "https://mikeobrien.games",
      socialLinks: JSON.stringify({
        twitter: "mikemakesgames",
        github: "mikeobrien-games",
      }),
    },
    {
      name: "Rachel Power",
      bio: "UX designer and researcher. [[{Design Lead} at {HeyOrca}]]. Advocate for accessible design and [[{Co-organizer} at {Women in Tech NL}]].",
      website: "https://rachelpower.design",
      socialLinks: JSON.stringify({
        twitter: "rachelpowerux",
        linkedin: "rachelpowerdesign",
      }),
    },
    {
      name: "David Murphy",
      bio: "[[{Senior Software Engineer} at {Mysa}]], working on IoT and embedded systems. Enjoys hardware hacking, home automation, and hiking the [[East Coast Trail Association]] trails.",
      socialLinks: JSON.stringify({
        github: "davemurphy-iot",
        linkedin: "davidmurphynl",
      }),
    },
    {
      name: "Amanda King",
      bio: "[[{Engineering Manager} at {Verafin}]] focused on growing and developing high-performing teams. Speaker on tech leadership and engineering culture.",
      website: "https://amandaking.tech",
      socialLinks: JSON.stringify({
        twitter: "amandaleads",
        linkedin: "amandakingnl",
      }),
    },
    {
      name: "Chris Parsons",
      bio: "Freelance web developer and consultant. Specializes in e-commerce and helping local businesses establish their online presence. [[{Mentor} at {Genesis Centre}]].",
      website: "https://chrisparsons.dev",
      socialLinks: JSON.stringify({
        twitter: "chrisbuildswebs",
        github: "chrisparsonsdev",
      }),
    },
    {
      name: "Lisa Fong",
      bio: "[[{Mobile Developer} at {Bluedrop ISM}]] building learning applications. Kotlin and Swift enthusiast. Regular speaker at [[NL Tech]] meetups.",
      socialLinks: JSON.stringify({
        github: "lisafongmobile",
        linkedin: "lisafongnl",
      }),
    },
    {
      name: "Tom Ryan",
      bio: "[[{DevOps Engineer} at {Kraken Robotics}]] passionate about cloud infrastructure and automation. AWS certified. Helping scale their systems for global deployment.",
      socialLinks: JSON.stringify({
        github: "tomryan-devops",
        linkedin: "tomryannl",
      }),
    },
    {
      name: "Jennifer Baird",
      bio: "[[{Product Manager} at {Solace Power}]] bridging the gap between engineering and business. Background in electrical engineering from [[Memorial University - Computer Science]].",
      website: "https://jenniferb.pm",
      socialLinks: JSON.stringify({
        twitter: "jenbairdpm",
        linkedin: "jenniferbairdnl",
      }),
    },
    {
      name: "Kevin Nolan",
      bio: "[[{Student} at {College of the North Atlantic - IT Programs}]] and aspiring developer. Active in [[freeCodeCamp St. John's Study Group]] and always eager to learn from the community.",
      socialLinks: JSON.stringify({
        github: "kevinnolan-dev",
        linkedin: "kevinnolanstj",
      }),
    },
  ];

  for (const person of peopleData) {
    await createPerson(person);
  }

  console.log(`  Created ${peopleData.length} people`);
}

async function seedNews() {
  console.log("Seeding news...");

  const newsData = [
    // Announcements (default type)
    {
      title: "NL Tech Community Hits 1,000 Members",
      type: "announcement" as const,
      content:
        "The NL Tech Slack community has reached a significant milestone, welcoming its 1,000th member this week. What started as a small group of developers has grown into the largest tech community in the province.\n\n## Growing Together\n\nThe community has seen steady growth over the past two years, with members representing companies of all sizes - from solo freelancers to major employers like [[Verafin]] and [[CoLab Software]].\n\n## What's Next\n\nOrganizers are planning special events to celebrate, including a community meetup and the launch of new channels focused on specific technologies and career development.",
      excerpt:
        "The NL Tech Slack community has reached a significant milestone, welcoming its 1,000th member this week.",
      publishedAt: daysFromNow(-2),
    },
    {
      title: "Mysa Announces Major Expansion",
      type: "announcement" as const,
      content:
        "[[Mysa]] has announced plans to double their engineering team over the next 18 months, adding 40 new positions to their St. John's headquarters.\n\n## New Products Coming\n\nThe expansion comes as the company prepares to launch several new smart home products beyond their popular thermostat line. CEO Josh Green cited strong sales and growing demand for Canadian-made smart home technology.\n\n## Hiring Now\n\nThe company is actively hiring for embedded software, mobile development, and cloud infrastructure roles. Interested candidates can check their careers page for open positions.",
      excerpt:
        "Mysa plans to double their engineering team with 40 new positions over the next 18 months.",
      publishedAt: daysFromNow(-5),
    },
    {
      title: "Women in Tech NL Launches Mentorship Program",
      type: "announcement" as const,
      content:
        "[[Women in Tech NL]] is launching a new mentorship program pairing experienced tech professionals with women early in their careers.\n\n## Program Details\n\nThe six-month program will match mentors and mentees based on career goals and technical interests. Monthly check-ins, workshops, and networking events will supplement one-on-one mentorship sessions.\n\n## How to Apply\n\nApplications are now open for both mentors and mentees. Visit the Women in Tech NL website to learn more and apply.",
      excerpt:
        "New mentorship program pairs experienced professionals with women early in their tech careers.",
      publishedAt: daysFromNow(-7),
    },
    {
      title: "Genesis Centre Announces Spring Cohort",
      type: "announcement" as const,
      content:
        "[[Genesis Centre]] has announced the startups selected for their spring accelerator cohort. The program will run for 12 weeks, providing funding, mentorship, and resources to help early-stage tech companies grow.\n\n## This Year's Focus\n\nThe cohort includes companies working on ocean technology, health tech, and B2B software - areas where Newfoundland has particular strengths and opportunities.\n\n## Demo Day\n\nThe program will culminate in a demo day in June where founders will pitch to investors and the community.",
      excerpt:
        "Genesis announces spring accelerator cohort focusing on ocean tech, health tech, and B2B software.",
      publishedAt: daysFromNow(-10),
    },
    {
      title: "Local Game Studio Releases First Title",
      type: "announcement" as const,
      content:
        "[[Clockwork Fox Studios]] has released their debut game 'Harbour Lights' on Steam after three years of development. The narrative adventure game is set in a fictional Newfoundland fishing community.\n\n## Critical Reception\n\nEarly reviews praise the game's atmospheric storytelling and authentic depiction of outport life. The soundtrack features local musicians.\n\n## Supporting Local Devs\n\nThe [[NL Game Developers]] community is encouraging locals to support the release and leave reviews to help with visibility.",
      excerpt:
        "Clockwork Fox Studios releases 'Harbour Lights', a narrative adventure set in Newfoundland.",
      publishedAt: daysFromNow(-14),
    },
    {
      title: "Kraken Robotics Wins Major Contract",
      type: "announcement" as const,
      content:
        "[[Kraken Robotics]] has been awarded a significant contract with the Royal Canadian Navy for their underwater sensing technology.\n\n## Contract Details\n\nThe multi-year agreement will see Kraken supply synthetic aperture sonar systems for mine countermeasure operations. The contract represents one of the largest in the company's history.\n\n## Local Impact\n\nThe work will primarily be done at Kraken's Mount Pearl facility, with plans to add engineering positions to support the program.",
      excerpt:
        "Kraken awarded major Royal Canadian Navy contract for underwater sensing technology.",
      publishedAt: daysFromNow(-30),
    },
    // Editorials - op-eds and analysis
    {
      title: "Why NL's Tech Scene is Poised for Growth",
      type: "editorial" as const,
      content:
        "Over the past decade, Newfoundland and Labrador has quietly built one of the most interesting tech ecosystems in Atlantic Canada. Here's why I think we're just getting started.\n\n## The Talent Pipeline\n\n[[Memorial University - Computer Science]] continues to produce strong graduates, and increasingly they're choosing to stay. The cost of living advantage compared to Toronto or Vancouver is real, and remote work has made it easier than ever to build a career here.\n\n## Homegrown Success Stories\n\nCompanies like [[Verafin]], [[CoLab Software]], and [[Mysa]] have proven you can build world-class products from St. John's. Their success creates a virtuous cycle - experienced developers who can mentor the next generation, and proof that ambitious founders don't need to relocate.\n\n## What's Missing\n\nWe still need more early-stage capital and a stronger culture of entrepreneurship. But organizations like [[Genesis Centre]] are working on that. The pieces are falling into place.\n\n## Looking Ahead\n\nThe next five years will be crucial. If we can retain talent, attract investment, and keep building community, NL could become a genuine tech hub. The foundation is there.",
      excerpt:
        "An analysis of why Newfoundland's tech ecosystem is positioned for significant growth in the coming years.",
      publishedAt: daysFromNow(-4),
    },
    {
      title: "The Case for Remote-First Companies in NL",
      type: "editorial" as const,
      content:
        "As someone who's worked both in-office and remotely, I've been thinking about what structure works best for Newfoundland tech companies.\n\n## The Geographic Reality\n\nLet's be honest: we're not going to out-compete Toronto for talent if we require everyone to be in the office. But we can compete on quality of life, cost of living, and flexibility.\n\n## What Remote-First Enables\n\nRemote-first doesn't mean never meeting in person. It means designing your company so that remote workers aren't second-class citizens. This opens up hiring across the province and beyond, while keeping your headquarters and culture rooted here.\n\n## The Community Angle\n\nGroups like [[NL Tech]] and [[St. John's JavaScript]] have shown that community doesn't require daily in-person interaction. Monthly meetups and annual conferences can maintain strong connections while respecting everyone's time and geography.\n\n## My Recommendation\n\nIf you're starting a company in NL, consider remote-first from day one. You'll have access to more talent, lower overhead, and happier employees.",
      excerpt: "Why Newfoundland tech companies should embrace remote-first work structures.",
      publishedAt: daysFromNow(-18),
    },
    // Meta - site updates
    {
      title: "Welcome to siliconharbour.dev",
      type: "meta" as const,
      content:
        "We're excited to launch siliconharbour.dev - a community directory for the Newfoundland and Labrador tech scene.\n\n## Why This Exists\n\nWe've always had great tech communities, companies, and events in NL, but no central place to discover them. This site aims to fix that.\n\n## What You'll Find\n\n- **Events**: Meetups, conferences, workshops, and hackathons\n- **Companies**: Local tech companies and startups\n- **Groups**: Community organizations and meetup groups\n- **People**: Community members who want to be listed\n- **Jobs**: Employment opportunities at local companies\n- **Projects**: Open source and community projects\n- **News**: Announcements and editorials about the local scene\n\n## Get Involved\n\nThis is a community resource. If you'd like to add a listing or suggest improvements, reach out via the contact page.\n\nLet's build something great together.",
      excerpt: "Introducing siliconharbour.dev - a community directory for the NL tech scene.",
      publishedAt: daysFromNow(-1),
    },
    {
      title: "Tech Salary Survey Results Released",
      type: "announcement" as const,
      content:
        "[[NL Tech]] has released the results of their annual salary survey, showing continued growth in tech compensation across the province.\n\n## Key Findings\n\n- Average developer salary increased 8% year-over-year\n- Remote work opportunities have expanded significantly\n- Most in-demand skills: React, Python, Cloud/DevOps\n\n## Full Report\n\nThe complete survey results, including breakdowns by experience level, role, and company size, are available on the NL Tech website.",
      excerpt: "Annual salary survey shows 8% increase in average developer compensation.",
      publishedAt: daysFromNow(-25),
    },
    {
      title: "MUN Computer Science Introduces AI Specialization",
      type: "announcement" as const,
      content:
        "[[Memorial University - Computer Science]] is introducing a new AI and Machine Learning specialization for undergraduate computer science students starting next fall.\n\n## Curriculum Updates\n\nThe specialization includes new courses in deep learning, natural language processing, and AI ethics. Students will have opportunities to work on research projects with faculty.\n\n## Industry Partnerships\n\nThe program includes partnerships with local companies including [[Sequence Bio]] and [[Verafin]] for co-op placements and capstone projects.",
      excerpt:
        "Memorial University launches new AI and Machine Learning specialization for CS students.",
      publishedAt: daysFromNow(-20),
    },
  ];

  for (const item of newsData) {
    await createNews(item);
  }

  console.log(`  Created ${newsData.length} news articles`);
}

async function seedJobs() {
  console.log("Seeding jobs...");

  const jobsData = [
    {
      title: "Senior Full-Stack Developer",
      description:
        "Join [[CoLab Software]] to build the future of engineering collaboration. We're looking for an experienced full-stack developer to work on our design review platform.\n\n## Requirements\n\n- 5+ years of professional development experience\n- Strong experience with React and TypeScript\n- Experience with Node.js or similar backend frameworks\n- Familiarity with CAD/3D visualization a plus\n\n## Benefits\n\n- Competitive salary and equity\n- Health benefits\n- Flexible work arrangements\n- Professional development budget",
      companyName: "CoLab Software",
      location: "St. John's, NL",
      remote: true,
      salaryRange: "$90k - $130k",
      applyLink: "https://colabsoftware.com/careers",
      postedAt: daysFromNow(-3),
      expiresAt: daysFromNow(30),
    },
    {
      title: "Data Engineer",
      description:
        "[[Verafin]] is seeking a Data Engineer to help build and maintain our data infrastructure. You'll work with petabytes of financial data to help detect and prevent financial crime.\n\n## Requirements\n\n- Experience with SQL and data warehousing\n- Knowledge of Python or Scala\n- Experience with distributed computing (Spark, Kafka)\n- Understanding of data modeling principles\n\n## What We Offer\n\n- Competitive compensation\n- Comprehensive benefits\n- RRSP matching\n- Downtown St. John's office",
      companyName: "Verafin",
      location: "St. John's, NL",
      remote: false,
      salaryRange: "$85k - $115k",
      applyLink: "https://verafin.com/careers",
      postedAt: daysFromNow(-5),
      expiresAt: daysFromNow(25),
    },
    {
      title: "Mobile Developer (iOS/Android)",
      description:
        "[[Mysa]] is looking for a mobile developer to join our team building apps for our smart thermostat products.\n\n## What You'll Do\n\n- Develop and maintain iOS and Android applications\n- Work closely with embedded and cloud teams\n- Implement new features and improve user experience\n\n## Requirements\n\n- 3+ years mobile development experience\n- Proficiency in Swift and/or Kotlin\n- Experience with IoT or Bluetooth LE is a plus\n\n## Perks\n\n- Free Mysa products for your home\n- Health and dental benefits\n- Stock options",
      companyName: "Mysa",
      location: "St. John's, NL",
      remote: true,
      salaryRange: "$75k - $100k",
      applyLink: "https://getmysa.com/careers",
      postedAt: daysFromNow(-7),
      expiresAt: daysFromNow(20),
    },
    {
      title: "UX Designer",
      description:
        "[[HeyOrca]] is hiring a UX Designer to help shape the future of our social media management platform.\n\n## Responsibilities\n\n- Conduct user research and usability testing\n- Create wireframes, prototypes, and high-fidelity designs\n- Collaborate with product and engineering teams\n- Contribute to our design system\n\n## Requirements\n\n- 3+ years of UX/product design experience\n- Proficiency in Figma\n- Portfolio demonstrating user-centered design process\n\n## Benefits\n\n- Fully remote-friendly\n- Flexible hours\n- Learning stipend",
      companyName: "HeyOrca",
      location: "St. John's, NL",
      remote: true,
      salaryRange: "$70k - $90k",
      applyLink: "https://heyorca.com/careers",
      postedAt: daysFromNow(-10),
      expiresAt: daysFromNow(15),
    },
    {
      title: "Junior Developer",
      description:
        "[[Bluedrop ISM]] is looking for a Junior Developer to join our learning solutions team. Great opportunity for recent graduates!\n\n## What You'll Learn\n\n- Modern web development with React\n- Backend development with .NET\n- Working on enterprise software projects\n- Agile development practices\n\n## Requirements\n\n- Degree or diploma in Computer Science or related field\n- Basic knowledge of JavaScript and HTML/CSS\n- Eagerness to learn and grow\n\n## What We Offer\n\n- Mentorship program\n- Training opportunities\n- Clear career progression path",
      companyName: "Bluedrop ISM",
      location: "St. John's, NL",
      remote: false,
      salaryRange: "$50k - $60k",
      applyLink: "https://bluedrop.com/careers",
      postedAt: daysFromNow(-12),
      expiresAt: daysFromNow(18),
    },
    {
      title: "DevOps Engineer",
      description:
        "[[Kraken Robotics]] needs a DevOps Engineer to help scale our infrastructure as we grow globally.\n\n## Responsibilities\n\n- Manage AWS infrastructure\n- Implement CI/CD pipelines\n- Monitor and improve system reliability\n- Collaborate with software teams\n\n## Requirements\n\n- 3+ years DevOps/SRE experience\n- Strong AWS knowledge\n- Experience with Kubernetes\n- Infrastructure as Code (Terraform preferred)\n\n## Benefits\n\n- Competitive salary\n- Work on cutting-edge ocean technology\n- Health benefits",
      companyName: "Kraken Robotics",
      location: "Mount Pearl, NL",
      remote: true,
      salaryRange: "$80k - $110k",
      applyLink: "https://krakenrobotics.com/careers",
      postedAt: daysFromNow(-14),
      expiresAt: daysFromNow(16),
    },
    {
      title: "Bioinformatics Developer",
      description:
        "[[Sequence Bio]] is seeking a Bioinformatics Developer to work on our genomics platform.\n\n## The Role\n\n- Develop tools for genomic data analysis\n- Build pipelines for processing sequencing data\n- Collaborate with research scientists\n- Contribute to drug discovery efforts\n\n## Requirements\n\n- Background in bioinformatics or computational biology\n- Experience with Python and R\n- Familiarity with genomics file formats and tools\n- Graduate degree preferred\n\n## Why Join Us\n\n- Meaningful work in healthcare\n- Cutting-edge technology\n- Collaborative environment",
      companyName: "Sequence Bio",
      location: "St. John's, NL",
      remote: false,
      salaryRange: "$75k - $100k",
      applyLink: "https://sequencebio.com/careers",
      postedAt: daysFromNow(-18),
      expiresAt: daysFromNow(12),
    },
    {
      title: "Freelance Web Developer",
      description:
        "Local marketing agency seeking freelance web developers for ongoing project work. Flexible hours and remote work available.\n\n## Project Types\n\n- WordPress and Shopify sites\n- Custom web applications\n- Landing pages and marketing sites\n\n## Requirements\n\n- Strong HTML, CSS, JavaScript skills\n- Experience with WordPress or Shopify\n- Good communication skills\n- Ability to work independently\n\n## Details\n\n- Flexible schedule\n- Competitive hourly rate\n- Ongoing work available",
      companyName: "Local Marketing Agency",
      location: "St. John's, NL",
      remote: true,
      salaryRange: "$50 - $75/hour",
      applyLink: "mailto:careers@localagency.ca",
      postedAt: daysFromNow(-20),
      expiresAt: daysFromNow(10),
    },
  ];

  for (const job of jobsData) {
    await createJob(job);
  }

  console.log(`  Created ${jobsData.length} jobs`);
}

async function seedProjects() {
  console.log("Seeding projects...");

  const projectsData = [
    {
      name: "Harbour Lights",
      description:
        "A narrative adventure game set in a fictional Newfoundland fishing community. Developed by [[Clockwork Fox Studios]] and created by [[Mike O'Brien]], the game explores themes of community, loss, and resilience through interactive storytelling.\n\n## Features\n\n- Atmospheric exploration of outport Newfoundland\n- Rich dialogue system with memorable characters\n- Original soundtrack featuring local musicians\n- Hand-painted art style inspired by the province's landscapes",
      type: "game" as const,
      status: "completed" as const,
      links: stringifyProjectLinks({
        website: "https://clockworkfoxstudios.com/harbour-lights",
        itchio: "https://clockworkfox.itch.io/harbour-lights",
        steam: "https://store.steampowered.com/app/harbour-lights",
      }),
    },
    {
      name: "NL Tech Slack Bot",
      description:
        "A custom Slack bot built for the [[NL Tech]] community. Helps with onboarding new members, answering FAQs, and facilitating community engagement.\n\n## Features\n\n- Automated welcome messages for new members\n- Channel recommendations based on interests\n- Event reminders and announcements\n- Community stats and leaderboards",
      type: "tool" as const,
      status: "active" as const,
      links: stringifyProjectLinks({
        github: "https://github.com/nltech/slack-bot",
      }),
    },
    {
      name: "Trail Finder NL",
      description:
        "A mobile-friendly web app for discovering and navigating trails across Newfoundland and Labrador. Built in partnership with [[East Coast Trail Association]].\n\n## Features\n\n- Interactive trail maps with GPS tracking\n- Difficulty ratings and estimated times\n- Photo galleries from other hikers\n- Offline map downloads\n- Trail condition updates",
      type: "webapp" as const,
      status: "active" as const,
      links: stringifyProjectLinks({
        website: "https://trailfinder.nl.ca",
        github: "https://github.com/ecta/trail-finder",
      }),
    },
    {
      name: "Signal Hill Weather Station",
      description:
        "An open-source weather monitoring station built by [[David Murphy]] and other local hardware enthusiasts. Provides real-time weather data from Signal Hill.\n\n## Hardware\n\n- Raspberry Pi 4 base station\n- Custom sensor array (temp, humidity, wind, barometric pressure)\n- Solar-powered with battery backup\n- LoRa connectivity for remote data transmission\n\n## Data\n\nAll data is publicly available through an open API and displayed on a community dashboard.",
      type: "hardware" as const,
      status: "active" as const,
      links: stringifyProjectLinks({
        github: "https://github.com/nlmakers/signal-hill-weather",
        website: "https://weather.signalhill.dev",
      }),
    },
    {
      name: "NL Open Data Toolkit",
      description:
        "A collection of Python libraries for working with Newfoundland and Labrador open data sources. Simplifies access to government data, environmental monitoring, and municipal information.\n\n## Included Libraries\n\n- `nl-gov-data`: Access provincial government datasets\n- `nl-weather`: Historical and real-time weather data\n- `nl-geo`: Geographic data and boundary files\n\nMaintained by volunteers from [[Data Science NL]].",
      type: "library" as const,
      status: "active" as const,
      links: stringifyProjectLinks({
        github: "https://github.com/datasciencenl/nl-open-data",
        docs: "https://nl-open-data.readthedocs.io",
      }),
    },
    {
      name: "Startup Matchmaker",
      description:
        "A tool developed at [[Genesis Centre]] to help connect startup founders with mentors based on skills, industry, and availability. Used internally by Genesis accelerator programs.\n\n## How It Works\n\n- Founders and mentors create profiles\n- Algorithm suggests optimal matches\n- Built-in scheduling for coffee chats\n- Feedback system to improve matches over time",
      type: "webapp" as const,
      status: "active" as const,
      links: stringifyProjectLinks({
        website: "https://matchmaker.genesis.mun.ca",
      }),
    },
    {
      name: "Iceberg Tracker",
      description:
        "A community project to track and photograph icebergs along the Newfoundland coast. Combines citizen science with modern web technologies.\n\n## Features\n\n- Submit iceberg sightings with photos and GPS\n- Real-time map of recent sightings\n- Integration with Canadian Ice Service data\n- Seasonal statistics and historical comparisons\n\nBuilt during an [[NL Game Developers]] game jam (but it's not a game!).",
      type: "webapp" as const,
      status: "on-hold" as const,
      links: stringifyProjectLinks({
        github: "https://github.com/nldev/iceberg-tracker",
        website: "https://icebergtracker.ca",
      }),
    },
    {
      name: "MUN Course Planner",
      description:
        "An unofficial course planning tool for [[Memorial University - Computer Science]] students. Helps visualize prerequisites and plan degree completion.\n\n## Features\n\n- Visual prerequisite tree\n- Drag-and-drop semester planning\n- Graduation requirement tracking\n- Export to calendar formats\n\nCreated by [[Kevin Nolan]] as a side project while completing his studies.",
      type: "tool" as const,
      status: "archived" as const,
      links: stringifyProjectLinks({
        github: "https://github.com/kevinnolan-dev/mun-planner",
      }),
    },
  ];

  for (const project of projectsData) {
    await createProject(project);
  }

  console.log(`  Created ${projectsData.length} projects`);
}

async function seedEvents() {
  console.log("Seeding events...");

  // First, create recurring events
  const recurringEventsData = [
    {
      event: {
        title: "Coffee & Trivia Socials NL (CTSNL)",
        description:
          "Weekly social gathering for the local tech community! Join us every Thursday evening for coffee, drinks, and tech trivia. A great way to meet other developers, designers, and tech enthusiasts in a casual setting.\n\n## What to Expect\n\n- Casual networking with local tech folks\n- Fun tech trivia rounds with prizes\n- Good coffee and conversation\n- Rotating venues around St. John's\n\nAll skill levels and backgrounds welcome. Whether you're a seasoned developer or just curious about tech, come hang out!",
        location: "Varies weekly - check Discord for details",
        link: "https://discord.gg/ctsnl",
        organizer: "CTSNL",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=TH",
        defaultStartTime: "19:00",
        defaultEndTime: "21:00",
        recurrenceEnd: null, // Indefinite
      },
    },
  ];

  for (const { event } of recurringEventsData) {
    await createEvent(event, []);
  }

  console.log(`  Created ${recurringEventsData.length} recurring events`);

  // Then, create one-time events
  const eventsData = [
    {
      event: {
        title: "NL Tech Monthly Meetup",
        description:
          "Join us for the monthly [[NL Tech]] meetup! This month we have two great talks lined up:\n\n1. **Building Resilient Microservices** - [[James Walsh]] shares lessons learned from scaling systems at Verafin\n2. **Intro to Rust** - A beginner-friendly introduction to the Rust programming language\n\nPizza and drinks provided. All skill levels welcome!",
        location: "Genesis Centre, Signal Hill Campus",
        link: "https://meetup.com/nltech",
        organizer: "NL Tech",
      },
      dates: [{ startDate: daysFromNow(3), endDate: hoursFromDate(daysFromNow(3), 2) }],
    },
    {
      event: {
        title: "JavaScript Workshop: React Hooks Deep Dive",
        description:
          "[[St. John's JavaScript]] presents a hands-on workshop diving deep into React Hooks.\n\n## What You'll Learn\n\n- useState and useEffect patterns\n- Custom hooks\n- Performance optimization with useMemo and useCallback\n- Common pitfalls and how to avoid them\n\nBring your laptop! We'll be coding together.",
        location: "CoLab Software Office",
        link: "https://meetup.com/stjohns-javascript",
        organizer: "St. John's JavaScript",
      },
      dates: [{ startDate: daysFromNow(5), endDate: hoursFromDate(daysFromNow(5), 3) }],
    },
    {
      event: {
        title: "Women in Tech NL - Career Panel",
        description:
          "[[Women in Tech NL]] hosts a career panel featuring women leaders in Newfoundland tech.\n\n## Panelists\n\n- [[Rachel Power]] - Design Lead, HeyOrca\n- [[Amanda King]] - Engineering Manager, Verafin\n- [[Emily Chen]] - Data Scientist, Sequence Bio\n\nQ&A session to follow. Refreshments provided.",
        location: "The Rooms, St. John's",
        link: "https://womenintechnl.ca/events",
        organizer: "Women in Tech NL",
      },
      dates: [{ startDate: daysFromNow(8), endDate: hoursFromDate(daysFromNow(8), 2.5) }],
    },
    {
      event: {
        title: "Data Science NL: Machine Learning in Production",
        description:
          "[[Data Science NL]] meetup focused on deploying ML models to production.\n\nTopics covered:\n- Model serving architectures\n- Monitoring and observability\n- MLOps best practices\n- Case studies from local companies",
        location: "Memorial University, EN-2006",
        link: "https://meetup.com/datasciencenl",
        organizer: "Data Science NL",
      },
      dates: [{ startDate: daysFromNow(12), endDate: hoursFromDate(daysFromNow(12), 2) }],
    },
    {
      event: {
        title: "Game Jam Weekend",
        description:
          "[[NL Game Developers]] presents a 48-hour game jam! Build a game from scratch over the weekend.\n\n## Details\n\n- Theme announced Friday at 6 PM\n- Work solo or in teams\n- Any engine/tools allowed\n- Prizes for top games\n\nFood and drinks provided. Sleeping bags encouraged!",
        location: "Genesis Centre",
        link: "https://discord.gg/nlgamedev",
        organizer: "NL Game Developers",
      },
      dates: [{ startDate: daysFromNow(15), endDate: daysFromNow(17) }],
    },
    {
      event: {
        title: "Startup Pitch Night",
        description:
          "[[Startup St. John's]] and [[Genesis Centre]] present monthly pitch night.\n\nFive early-stage startups will pitch their ideas to a panel of local investors and mentors. Great networking opportunity for founders and those interested in the startup ecosystem.",
        location: "Genesis Centre",
        link: "https://startupstjohns.ca/events",
        organizer: "Startup St. John's",
      },
      dates: [{ startDate: daysFromNow(20), endDate: hoursFromDate(daysFromNow(20), 3) }],
    },
    {
      event: {
        title: "freeCodeCamp Study Group",
        description:
          "Weekly [[freeCodeCamp St. John's Study Group]] meetup. This week we're working through the JavaScript algorithms section.\n\nAll levels welcome - come learn together!",
        location: "St. John's Public Library, A.C. Hunter Branch",
        link: "https://meetup.com/freecodecamp-stjohns",
        organizer: "freeCodeCamp St. John's",
      },
      dates: [
        { startDate: daysFromNow(1), endDate: hoursFromDate(daysFromNow(1), 2) },
        { startDate: daysFromNow(8), endDate: hoursFromDate(daysFromNow(8), 2) },
        { startDate: daysFromNow(15), endDate: hoursFromDate(daysFromNow(15), 2) },
      ],
    },
    {
      event: {
        title: "Tech Leadership Breakfast",
        description:
          "A breakfast gathering for tech leaders and managers. Informal discussion on building teams, company culture, and leadership challenges.\n\nLimited to 20 attendees to keep discussion intimate.",
        location: "Rocket Bakery, Water Street",
        link: "https://nltech.ca/events",
        organizer: "NL Tech",
      },
      dates: [{ startDate: daysFromNow(6), endDate: hoursFromDate(daysFromNow(6), 1.5) }],
    },
    {
      event: {
        title: "Intro to Cloud Computing Workshop",
        description:
          "[[College of the North Atlantic - IT Programs]] is hosting a free workshop on cloud computing basics.\n\n## Topics\n\n- What is cloud computing?\n- Overview of AWS, Azure, and GCP\n- Hands-on: Deploy your first cloud application\n\nOpen to the public. Registration required.",
        location: "College of the North Atlantic, Prince Philip Drive",
        link: "https://cna.nl.ca/events",
        organizer: "College of the North Atlantic",
      },
      dates: [{ startDate: daysFromNow(25), endDate: hoursFromDate(daysFromNow(25), 4) }],
    },
    {
      event: {
        title: "Harbour Lights Launch Party",
        description:
          "Celebrate the launch of 'Harbour Lights' with [[Clockwork Fox Studios]]!\n\nJoin creator [[Mike O'Brien]] and the development team for a launch party featuring:\n- Live playthrough and Q&A\n- Behind-the-scenes look at development\n- Local music from the soundtrack artists\n- Free food and drinks",
        location: "The Ship Pub, St. John's",
        link: "https://clockworkfoxstudios.com/launch",
        organizer: "Clockwork Fox Studios",
      },
      dates: [{ startDate: daysFromNow(2), endDate: hoursFromDate(daysFromNow(2), 4) }],
    },
  ];

  for (const { event, dates } of eventsData) {
    await createEvent(event, dates);
  }

  console.log(`  Created ${eventsData.length} events`);
}

async function seed() {
  console.log("Starting seed process...");

  // Check if we should proceed
  const isEmpty = await checkEmpty();

  if (!isEmpty && !forceReset) {
    console.log("\nDatabase already contains data. Use --force to clear and re-seed.");
    console.log("Skipping seed to preserve existing data.");
    process.exit(0);
  }

  if (forceReset) {
    await clearAllData();
  }

  // Seed in dependency order (companies/groups/learning first since people reference them)
  await seedCompanies();
  await seedGroups();
  await seedEducation();
  await seedPeople();
  await seedNews();
  await seedJobs();
  await seedProjects();
  await seedEvents();

  console.log("\nSeed completed successfully!");
}

seed().catch((err) => {
  console.error("Error during seed:", err);
  process.exit(1);
});
