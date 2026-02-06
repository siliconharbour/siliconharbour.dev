# Company Career Pages - Custom / Hand-Cooked Sites

These companies don't use a standard ATS with a public API. They have custom career
pages that would need individual scrapers or manual entry. Lower priority than building
generic ATS importers, but we should still figure out auto-import for these eventually.

## NetBenefit Software

- **Website:** https://www.netbenefitsoftware.com
- **Careers:** https://www.netbenefitsoftware.com/careers
- **Platform:** Webflow
- **How jobs are listed:** Static content on page with PDF job descriptions hosted on Webflow CDN.
  Apply via email (careers@netbenefitsoftware.com).
- **Current openings (as of Feb 2026):** 2 (Full Stack Software Developer, Senior Implementation Consultant)
- **Scraping approach:** Parse Webflow page HTML for job titles and links.
- **DB company ID:** 143

## Bluedrop ISM

- **Website:** https://bluedropism.com
- **Careers:** https://bluedropism.com/careers
- **Platform:** Custom site
- **How jobs are listed:** Standard HTML careers page. Needs further investigation for structure.
- **Scraping approach:** HTML scrape of careers page.
- **DB company ID:** 27

## C-CORE

- **Website:** https://c-core.ca
- **Careers:** https://c-core.ca/working-at-c-core/
- **Platform:** WordPress
- **How jobs are listed:** Individual WordPress pages linked from main careers page under "Active Searches".
  Apply via email (careers@c-core.ca).
- **Current openings (as of Feb 2026):** 4 (Electrical/Electronics Engineer, 2x Software Developer, Senior Research Engineer/Scientist)
- **Scraping approach:** Parse WordPress careers page for links under "Active Searches" section.
- **DB company ID:** 38

## Compusult

- **Website:** https://www.compusult.com
- **Careers:** https://www.compusult.com/careers
- **Platform:** Liferay CMS
- **How jobs are listed:** Liferay-powered page. Very heavy JS/CMS framework. Job content may be
  embedded in Liferay content blocks.
- **Scraping approach:** Challenging due to Liferay framework. May need to parse rendered HTML.
- **DB company ID:** 48

## Enaimco

- **Website:** https://enaimco.com
- **Careers:** https://enaimco.com/careers/
- **Platform:** WordPress
- **How jobs are listed:** Custom WordPress page with "Available Positions" section and an apply form.
- **Current openings (as of Feb 2026):** 0
- **Scraping approach:** Parse WordPress page for job listings under "Available Positions".
- **DB company ID:** 68

## GroundControl

- **Website:** https://www.groundcontrol.ai (unreachable as of Feb 2026)
- **Platform:** Unknown
- **Notes:** Site was not responding during investigation. Needs re-check.
- **DB company ID:** 91

## PolyUnity Tech Inc.

- **Website:** https://www.polyunity.com
- **Careers:** https://www.polyunity.com/work-with-us
- **Platform:** Webflow
- **How jobs are listed:** "Work with us" page. No structured job listings visible - appears to be
  a general "join us" page rather than specific openings.
- **Scraping approach:** May not have structured job data to scrape.
- **DB company ID:** 167

## SiftMed

- **Website:** https://www.siftmed.ca
- **Careers:** https://www.siftmed.ca/jobs
- **Platform:** Wix
- **How jobs are listed:** Wix built-in jobs feature. Page exists but no visible openings as of Feb 2026.
- **Scraping approach:** Wix jobs may have internal API endpoints. Needs investigation.
- **DB company ID:** 191

---

## Companies Using ATS Systems Without Importers Yet

These use known ATS platforms we haven't built importers for yet. See tickets for importer work.

### Avalon Holographics - ADP Workforce Now

- **Careers URL:** https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=384f5e8d-ce48-4dbd-8c5e-fd9601da7e77
- **Notes:** ADP Workforce Now is a heavy JS-rendered recruitment portal. Low priority unless more
  companies use it.
- **DB company ID:** 18

### HeyOrca - Collage

- **Careers URL:** https://secure.collage.co/jobs/heyorca/
- **Identifier:** heyorca
- **Importer ticket:** s-5d57
- **DB company ID:** 253

### Solace Power - Collage

- **Careers URL:** https://secure.collage.co/jobs/solacepower/
- **Identifier:** solacepower
- **Importer ticket:** s-5d57
- **DB company ID:** 287

### Kraken Robotics - Rippling

- **Careers URL:** https://ats.rippling.com/kraken-robotics-inc/jobs
- **Identifier:** kraken-robotics-inc
- **Importer ticket:** s-e5c5
- **DB company ID:** 117

### Mysa - Lever

- **Careers URL:** https://jobs.lever.co/getmysa
- **Identifier:** getmysa
- **Importer ticket:** s-608e
- **DB company ID:** 265 (or 138 for "Mysa Smart Thermostat")

### Milk Moovement - Lever

- **Careers URL:** https://jobs.lever.co/milk-moovement
- **Identifier:** milk-moovement
- **Importer ticket:** s-608e
- **DB company ID:** 132

---

## All Known Career Page URLs

Sourced from CTS-NL data and our own research. These are set in the `careers_url`
field on the `companies` table so the /jobs page links to careers pages instead
of company websites. Companies with active ATS importers are marked.

| Company | Careers URL | ATS / Notes |
|---------|-------------|-------------|
| Avalon Holographics | https://www.avalonholographics.com/careers | ADP Workforce Now |
| Bluedrop ISM | https://bluedropism.com/careers/#jobs | Custom |
| BreatheSuite | https://www.breathesuite.com/careers | BambooHR (breathesuite) |
| C-CORE | https://c-core.ca/working-at-c-core/ | WordPress, email apply |
| Carnegie Learning (Zorbit's) | https://zorbitsmath.com/careers | Custom |
| Celtx | https://www.celtx.com/careers.html | HRMDirect |
| ClearRisk | https://www.clearrisk.com/about-clearrisk/careers | Custom |
| CoLab Software | https://www.colabsoftware.com/careers | **Greenhouse** (active) |
| Compusult | https://www.compusult.com/web/guest/careers | Liferay CMS |
| Enaimco | https://enaimco.com/careers/ | WordPress |
| Focus FS | https://focusfs.com/company/careers/ | Custom |
| Fonemed | https://www.fonemed.com/ | ApplyToJob |
| Genoa Design | https://genoadesign.com/careers/ | Dayforce HCM |
| HeyOrca | https://www.heyorca.com/careers | **Collage** (active) |
| HYKE | https://www.hykeup.com/ | Custom |
| Instrumar | https://www.instrumar.com/ | Custom |
| Kraken Robotics | https://www.krakenrobotics.com/careers/ | **Rippling** (active) |
| MetricsFlow | https://www.metricsflow.com/ | Custom |
| Milk Moovement | https://jobs.lever.co/milk-moovement | **Lever** (active) |
| Mysa | https://getmysa.com/pages/careers | **Lever** (active) |
| Nasdaq Verafin | https://nasdaq.wd1.myworkdayjobs.com/... | **Workday** (active) |
| NetBenefit Software | https://www.netbenefitsoftware.com/careers | Webflow, email apply |
| Oliver POS | https://oliverpos.com/company/careers/ | Custom |
| OPAS Mobile | https://www.opasmobile.com/ | Custom |
| Other Ocean Interactive | https://otherocean.com/careers/ | Custom |
| Pinnacle Networks | https://www.pinnacleoffice.ca/networks/ | Custom |
| PolyUnity | https://www.polyunity.com/work-with-us | Webflow |
| Q5 Systems | https://q5systems.com/ | Custom |
| qualiTEAS | https://www.qualiteas.ca/ | Custom |
| Ray Creative Agency | https://rayagency.ca/career-opportunities/ | Custom |
| Rutter | https://rutter.ca/careers/ | Custom |
| Sequence Bio | https://www.sequencebio.com/careers | BambooHR? |
| SiftMed | https://www.siftmed.ca/jobs | Wix |
| SmartICE | http://www.smartice.org/employment-training/ | Custom |
| Solace Power | https://www.solace.ca/careers | **Collage** (active) |
| Spellbook | https://www.spellbook.legal/careers | **Ashby** (active) |
| StrobelTEK | https://strobeltek.com/careers/ | Custom |
| Strong Data | https://www.strongdata.ca/ | Custom |
| SubC Imaging | https://www.subcimaging.com/ | Custom |
| techNL | https://technl.ca/job-seekers/ | Custom |
| TownSuite Municipal Software | https://townsuite.com/jobs | Custom |
| Triware Technologies | https://triware.ca/careers/ | Custom |
| trophi.ai | https://www.trophi.ai/careers | **BambooHR** (active) |
| Veristart | https://www.veristart.ca/ | Custom |
| Virtual Marine | https://www.virtualmarine.ca/careers | Custom |
| Vish | https://getvish.com/about-vish/careers/ | Custom |
| Vision33 | https://jobs.vision33.com/careers/31076-Vision33 | BambooHR? |

### Additional career URLs from CTS-NL (companies not in our DB yet)

See `companies-missing-but-on-cts.md` for the full list of companies to add.

| Company | Careers URL | ATS |
|---------|-------------|-----|
| BlueDriver | https://www.bluedriver.com/about-us/careers | Custom |
| Bullseye Branding | https://www.bullseyebranding.ca/opportunities/ | Custom |
| Inspectar | https://www.inspectar.com/careers#open-positions | Custom |
| IOA Software Solutions | https://ioass.com/careers-1 | Custom |
| Mobia | https://canr57.dayforcehcm.com/... | Dayforce HCM |
| PanGeo Subsea | https://www.pangeosubsea.com/careers-2/ | Custom |
| Radient360 | https://radient360.com/careers/ | Custom |
| Rally | https://rallynow.freshteam.com/jobs | Freshteam |
| totaliQ | https://yourtotaliq.freshteam.com/jobs | Freshteam |
| Target Marketing | https://targetmarketing.ca/#careers | Custom |
| Newfoundland Power | https://careers.newfoundlandpower.com/default | Custom |
| NL Hydro | https://nlhydro.com/careers/current-opportunities/ | Custom |
| NLHC | https://www.nlhc.nl.ca/jobs/ | Custom |
| NLCHI | ADP Workforce Now (cid=7aaf2373...) | ADP |
| PAL Airlines | ADP Workforce Now (cid=03260d95...) | ADP |
| Eastern Health | https://employment.easternhealth.ca/... | Custom |
| College of the North Atlantic | https://www.cna.nl.ca/careers/ | Custom |
| Memorial University | https://www.mun.ca/hr/careers/external.php | Custom |
| Government of NL | https://www.hiring.gov.nl.ca/Jobs.aspx/Public | Custom |
