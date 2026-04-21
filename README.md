# Job Hub — Personal Portfolio + Daily Job Dashboard

A single link you can share for your resume AND a private dashboard that pulls fresh jobs from LinkedIn/Indeed alternatives every day, then scores each one against your resume so you know exactly what to apply to and what to tweak.

## What's inside

- **`index.html`** — public portfolio + resume landing page (share this link on applications)
- **`jobs.html`** — daily job dashboard with match-% against your resume
- **`matcher.html`** — paste any job description and see match %, missing keywords, and suggested edits
- **`data/resume.json`** — structured resume (edit this one file to update every page)
- **`data/jobs.json`** — auto-refreshed daily by GitHub Actions
- **`data/manual-jobs.json`** — paste LinkedIn/Indeed links here manually (they have no free API)
- **`scripts/fetch_jobs.py`** — the daily fetcher (pulls from RemoteOK, Remotive, Arbeitnow, WeWorkRemotely)
- **`.github/workflows/fetch-jobs.yml`** — runs the fetcher every day at 06:00 UTC

## Setup (5 minutes)

1. **Create a new GitHub repo** named `your-username.github.io` (this makes the URL `https://your-username.github.io`).
2. **Push this folder** to that repo.
3. In the repo, go to **Settings → Pages → Source: `main` branch, `/` root**. Save.
4. In **Settings → Actions → General → Workflow permissions**, select **"Read and write permissions"** (so the fetcher can commit updated JSON back).
5. Edit `data/resume.json` with your real info. Replace `assets/resume.pdf` with your actual resume.
6. (Optional) Edit `data/sources.json` to add search keywords specific to your field.

That's it. Your site is live at `https://your-username.github.io`. The jobs refresh daily.

## Daily workflow

1. Open your site in the morning. `jobs.html` shows today's new listings sorted by match %.
2. Top matches — apply directly (links go to the source site).
3. For a specific posting, open `matcher.html`, paste the full job description, and see the exact keywords missing from your resume.

## Customizing

| File | What to edit |
|------|--------------|
| `data/resume.json` | Your name, title, experience, skills, projects, education |
| `data/skills.json` | Skills the matcher knows about (add your stack) |
| `data/sources.json` | Search keywords for the fetcher (role titles, locations) |
| `data/manual-jobs.json` | Paste LinkedIn/Indeed links here — they'll show up in the dashboard |
| `assets/resume.pdf` | Your downloadable resume |
| `css/styles.css` | Colors, fonts, layout |

## Why no LinkedIn/Indeed scraping?

LinkedIn's ToS prohibits scraping and they actively block it. Indeed shut down public scraping too. Instead this pulls from sources that **want** to be aggregated: RemoteOK, Remotive, Arbeitnow, WeWorkRemotely. For LinkedIn/Indeed, paste links into `data/manual-jobs.json` — takes 10 seconds per job and they'll flow through the matcher the same way.

## Tech

- Static HTML/CSS/vanilla JS — no build step, no frameworks to learn
- Python fetcher (only runs in GitHub Actions, not in your browser)
- Client-side resume matcher using TF-IDF + skills-dictionary overlap
