# Pipeline — Design & Development Kanban Board

**Pipeline** is a sleek, modern Kanban board tailored for page design and development teams. It provides an intuitive interface to manage tasks, track priorities, assign teammates, attach Figma mockup links, and monitor progress across six workflow stages — powered by a lightweight Express & Vercel serverless backend.

---

## ✨ Features

- **6 Workflow Stages**: `Backlog`, `Design`, `Design Review`, `Development`, `QA`, `Done`.
- **Drag & Drop**: Smoothly drag cards between workflow stages.
- **Priority Management**: Visual indicators for Urgent, High, Medium, and Low priorities.
- **Filter & Search**: Search cards by title/description and filter by assignee or priority.
- **Team Management**: Add or remove teammates and track active cards assigned to each member.
- **Figma Integration**: Direct link access to Figma mockups right from card badges.
- **Due Date Tracking**: Highlights overdue cards and upcoming deadlines automatically.
- **Dual Persistence**: SQLite database (`pipeline.sqlite`) for local use & Vercel Serverless Functions (`api/index.js`) for online deployment.

---

## 🚀 Quick Start Guide

### Local Development
```bash
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🐙 Step 1: Push to GitHub

Your local Git repository is initialized and committed. Follow these steps to push to GitHub:

1. Go to [github.com/new](https://github.com/new) and create a repository named **`pipeline-kanban`**.
2. Run the following commands in your terminal:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/pipeline-kanban.git
   git push -u origin main
   ```

---

## 📐 Step 2: Deploy to Vercel

### Option A: Via Vercel Dashboard (Easiest)
1. Log in to [vercel.com](https://vercel.com).
2. Click **"Add New"** → **"Project"**.
3. Import your **`pipeline-kanban`** GitHub repository.
4. Click **"Deploy"** (Vercel will detect Vite + `api/index.js` serverless function automatically).
5. You'll get your live link: `https://pipeline-kanban.vercel.app`!

### Option B: Via Terminal
Run the following command directly in your project folder:
```bash
npx vercel
```
Follow the prompts to publish instantly!

---

## 📁 Project Structure

```text
Pipeline/
├── pipeline.jsx        # Main React component & UI
├── server/
│   ├── index.js        # Express API server (local dev)
│   └── db.js           # SQLite handler & queries
├── api/
│   └── index.js        # Vercel Serverless API handler
├── vercel.json         # Vercel route rewrites
├── pipeline.sqlite     # Local SQLite database
├── index.html          # HTML entry point
├── package.json        # Dependencies & scripts
├── vite.config.js      # Vite build & proxy config
└── README.md           # Documentation
```
