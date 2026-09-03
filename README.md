# 🎯 Smart Job Hunter & Networking CRM

A personalized, automated job search engine and application tracker built with Next.js. 
This system scrapes open positions from major Applicant Tracking Systems (ATS) and automatically cross-references them with the user's personal LinkedIn connections to find warm referral opportunities.

## 🚀 The Problem It Solves
Job hunting often involves manually scouring multiple company pages and trying to remember if you know someone who works there. This application automates the process by targeting specific ATS platforms popular in the tech industry, applying strict geographical and experience-level filters, and instantly matching the results with your LinkedIn network.

## ✨ Key Features

* **Targeted ATS Scraping:** Integrates with SerpApi to fetch real-time job postings from top platforms: `Comeet`, `Greenhouse`, `Lever`, `Ashby`, and `Workable`.
* **Smart Networking Algorithm:** 
  * Parses exported LinkedIn `Connections.csv` files locally (bypassing LinkedIn API restrictions).
  * Uses a hybrid matching engine (`Fuse.js` for fuzzy matching + Regex word-boundary brute-forcing) to perfectly match complex URL company slugs (e.g., `abra_rnd`) with official LinkedIn company names (e.g., `abra R&D Solutions`).
* **Advanced Filtering:** Filters results by Job Title, Platform, Experience Level (Junior/Mid/Senior), and Years of Experience.
* **Geographical Precision:** Optimized for the local tech market with hardcoded location heuristics to eliminate irrelevant global remote listings.
* **Built-in Application CRM (Job Tracker):** A dedicated dashboard to manage applications, track CV versions (e.g., Full Stack vs. Embedded), log interview statuses, and set follow-up dates.

## 🛠️ Tech Stack

* **Framework:** Next.js (App Router)
* **Styling:** Tailwind CSS
* **Data Fetching:** SerpApi (Google Search Engine API)
* **Data Processing:** PapaParse (CSV parsing)
* **Search Logic:** Fuse.js (Lightweight fuzzy-search)

## 📦 Getting Started

### Prerequisites
1. Node.js installed on your machine.
2. A free API key from [SerpApi](https://serpapi.com/).
3. Your LinkedIn Connections export file (`Connections.csv`).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yuvalalkalay2024/Smart-Job-Hunter.git
   cd your-repo-name
