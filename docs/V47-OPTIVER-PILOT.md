# V47 pilot — Official Careers sites and underlying ATS

## Scope
- Supports the official Optiver Careers page `https://www.optiver.com/join-us/jobs/` as a recognized **candidate** mapped to Greenhouse `optiverus`.
- Preserves standard ATS recognition for Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Workable, Teamtailor and Recruitee.
- Matching requires the exact official host, expected path and company name.
- Neither the browser nor a developer assumption activates an unverified feed: the existing `/api/ats-probe` must report a live feed. Activation still requires explicit user approval and authentication.

## Evidence / caveats
- Official site lists Optiver jobs: https://www.optiver.com/join-us/jobs/
- Optiver's privacy materials indicate use of Greenhouse.
- Independent research identifies `optiverus` as Greenhouse board token, noting the guessed `optiver` token can fail: https://finm-32800.github.io/notebooks/_job_postings_methods_ipynb.html
- **The live public feed has not been verified from this authoring environment.** The web search endpoint for this board timed out. Treat as candidate only until API probe succeeds.
- Some Greenhouse Optiver sub-boards are for specific purposes (`optiverprivate`, `optiverneurips`); do not treat them as the main corporate board.

## How to test in preview (not production)
1. In Company Audit choose Optiver and enter the **official** https://www.optiver.com/join-us/jobs/ URL.
2. Press **Verifica e salva**. If the /api/ats-probe confirms `optiverus`, save as verified; otherwise leave unmonitored.
3. In manual source tool, use Optiver + official Careers URL; verify it proposes Greenhouse.
4. Check non-Optiver URLs stay unsupported unless they are a recognized ATS link.
5. Run `node tests/official-careers.test.cjs` before any merge.
6. Only publish after green checks and an explicit approval.

No changes to D1 schema, cron, secrets, backend, or production branch in this pilot.
