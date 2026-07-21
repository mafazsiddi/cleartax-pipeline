# Pipeline — Design & Development Kanban Board

**Pipeline** is a sleek, modern Kanban board tailored for page design and development teams. It provides an intuitive interface to manage tasks, track priorities, assign teammates, attach Figma mockup links, and monitor progress across six workflow stages — powered by a lightweight **Express + SQLite backend**.

---

## ✨ Features

- **6 Workflow Stages**:
  - `Backlog`
  - `Design`
  - `Design Review`
  - `Development`
  - `QA`
  - `Done`
- **Drag & Drop**: Smoothly drag cards between workflow stages.
- **Priority Management**: Visual indicators for Urgent, High, Medium, and Low priorities.
- **Filter & Search**: Quickly search cards by title/description and filter by assignee or priority.
- **Team Management**: Add or remove teammates and track active cards assigned to each member.
- **Figma Integration**: Direct link access to Figma mockups right from card badges.
- **Due Date Tracking**: Highlights overdue cards and upcoming deadlines automatically.
- **Persistent Backend**: Express API + local SQLite database (`pipeline.sqlite`) keeps data saved permanently.

---

## 🚀 Quick Start Guide

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v16.0 or higher recommended).

### 1. Install Dependencies
Run the following command in the project root directory:

```bash
npm install
```

### 2. Start for Local Development
Launch both the Express backend server and the Vite dev server with a single command:

```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🌐 How to Share the App & Take it Live

Here are 3 ways to take the application live and share the link with your team:

### Option 1: Instant Sharing via Localtunnel (Fastest & Free)
Share your running board with anyone on the internet instantly without cloud configuration:
1. Run `npm run dev` in one terminal window.
2. In a second terminal window, run:
   ```bash
   npx localtunnel --port 5173
   ```
3. Copy the generated public URL (e.g. `https://xxx.loca.lt`) and share it with your team!

---

### Option 2: Local Network Sharing (Wi-Fi / Office Network)
If your teammates are on the same Wi-Fi or local office network:
1. Run `npm run dev -- --host`
2. Find your local IP address (`ipconfig` on Windows).
3. Share your network link: `http://<your-ip-address>:5173`

---

### Option 3: Deploy to Cloud (Render / Railway / Render.com)
To host the app online 24/7 on a public domain:
1. Build the production app:
   ```bash
   npm run build
   ```
2. Push your project to a GitHub repository.
3. Connect the repository to **Render.com** or **Railway.app**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Port**: `3001` (or default `$PORT`)

---

## 🛠️ Available Scripts

- `npm run dev`: Concurrently runs the Express API server and Vite frontend server.
- `npm run start`: Runs the single unified Express server serving both static frontend (`dist/`) and API.
- `npm run build`: Compiles and bundles the production frontend into the `dist/` folder.

---

## 📁 Project Structure

```text
Pipeline/
├── pipeline.jsx        # Main React component & UI
├── server/
│   ├── index.js        # Express API server & static dist handler
│   └── db.js           # SQLite connection, schema & query helpers
├── pipeline.sqlite     # SQLite database file (created automatically)
├── dist/               # Production bundle (created by npm run build)
├── index.html          # HTML entry point
├── package.json        # Node dependencies & project scripts
├── vite.config.js      # Vite build & API proxy configuration
└── README.md           # Project documentation
```
