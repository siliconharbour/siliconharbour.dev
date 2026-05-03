# News Sources Research

Researched 2026-05-03. Looking for RSS feeds and scrapeable news sources covering the NL tech ecosystem.

## Confirmed RSS Feeds

### Tier 1: Tech-Focused (auto-import everything)

| Source | Feed URL | Items | Notes |
|--------|----------|-------|-------|
| **TechNL** (all) | `https://technl.ca/feed/` | 10 | WordPress RSS. Mix of blog posts and news releases. |
| **TechNL** (news only) | `https://technl.ca/category/news/feed/` | 10 | Just news releases, press releases, RFPs. |
| **TechNL** (blog only) | `https://technl.ca/category/blog/feed/` | 10 | Blog posts, profiles, hackathon recaps. |
| **Bounce Health Innovation** (success stories) | `https://bounceinnovation.ca/category/success-stories/feed/` | ~6 | NL healthtech company stories: SiftMed, TxtSquad, Sparrow BioAcoustics, PolyUnity, Fonemed, Granville. This is the good feed. |

**Note on Bounce:** The main feed (`/feed/`) pulls in international health news aggregation -- not useful. The `success-stories` category feed has the NL-specific content.

### Tier 2: General NL News (keyword-filter required)

| Source | Feed URL | Items | Keywords needed |
|--------|----------|-------|-----------------|
| **CBC NL** | `https://rss.cbc.ca/lineup/canada-newfoundland.xml` | 20 | tech, startup, innovation, digital, software, AI, venture, funding, TechNL, Genesis, Bounce, Verafin, CoLab, Spellbook, Kraken, SiftMed, HeyOrca, Mysa |
| **VOCM** | `https://vocm.com/feed/` | 10 | WordPress RSS -- same keywords as CBC. VOCM actually has RSS despite initial assumption it wouldn't. |
| **NTV** | `https://ntv.ca/feed/` | 10+ | Same keywords. General NL news station. |
| **MUN Gazette** | `https://gazette.mun.ca/feed/` | 10 | tech, startup, computer science, engineering, Genesis, AI, innovation, research |

### Tier 3: Broader Canadian Tech (keyword-filter required)

| Source | Feed URL | Items | Keywords needed |
|--------|----------|-------|-----------------|
| **BetaKit** | `https://betakit.com/feed/` | 10+ | Newfoundland, Labrador, St. John's, NL, Atlantic Canada |

## No RSS Available

| Source | URL | Notes |
|--------|-----|-------|
| **Genesis Centre** | `https://www.genesiscentre.ca/blog` | No RSS feed. Returns 404 on `/feed/` and `/blog/feed/`. Blog exists but isn't syndicated. Would need custom scraper. |
| **Entrevestor** | `https://entrevestor.com` | Atlantic Canada startup news. Excellent NL coverage (Spellbook, CoLab, Genesis, Pelorus). `/blog/list/text/rss` returns HTML, all other RSS paths 404. Would need custom scraper. Very high value source. |
| **SaltWire / The Telegram** | `https://www.thetelegram.com` | Redirects to saltwire.com. RSS URL exists but redirects to main site. Paywalled anyway. Skip. |
| **allNewfoundlandLabrador** | `https://www.allnewfoundlandlabrador.com` | Feed returns 404. Skip. |
| **Get Building** | `https://getbuilding.ca` | Feed returns 404. Not a news source anyway. |

## Recommended Initial Configuration

### Phase 1: RSS sources (ready now)

1. **TechNL** -- use the main feed `https://technl.ca/feed/` to get both news and blog posts. No keywords needed.
2. **Bounce Health Innovation** -- use `https://bounceinnovation.ca/category/success-stories/feed/`. No keywords needed.
3. **CBC NL** -- use `https://rss.cbc.ca/lineup/canada-newfoundland.xml` with keywords: `tech, startup, innovation, software, AI, digital, venture, funding, TechNL, Genesis, Bounce, CoLab, Spellbook, Kraken, SiftMed, Verafin, HeyOrca, Mysa`
4. **VOCM** -- use `https://vocm.com/feed/` with same keywords as CBC.

### Phase 2: Consider later

5. **NTV** -- `https://ntv.ca/feed/` with keywords. Lower signal than CBC/VOCM.
6. **BetaKit** -- `https://betakit.com/feed/` with NL-specific keywords. Occasional NL coverage.
7. **MUN Gazette** -- `https://gazette.mun.ca/feed/` with tech/research keywords. Mostly academic.
8. **Gov NL Releases** -- `https://www.releases.gov.nl.ca/rss/all-gnl-releases.xml` with tech keywords. Government press releases.

### Phase 3: Custom scrapers needed

9. **Entrevestor** -- highest value source without RSS. Covers NL startups extensively (Spellbook, CoLab, Genesis cohorts, Pelorus VC, funding rounds). Worth building a scraper.
10. **Genesis Centre blog** -- no RSS but has a blog page at `/blog`. Lower priority since TechNL often covers the same stories.
