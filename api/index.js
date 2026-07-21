import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let boardData = {
  members: ['Aarav', 'Priya', 'Jordan', 'Sana'],
  tasks: [
    { id: 't_1', title: 'Redesign pricing page hero', stage: 'design', priority: 'high', assignee: 'Priya', figmaLink: 'https://figma.com', description: 'New hero with a clearer plan comparison.', dueDate: '' },
    { id: 't_2', title: 'Build /income-tax-calculator landing', stage: 'development', priority: 'urgent', assignee: 'Aarav', figmaLink: '', description: 'Responsive build from approved mockups.', dueDate: '' },
    { id: 't_3', title: 'QA checkout flow on mobile', stage: 'qa', priority: 'medium', assignee: 'Sana', figmaLink: '', description: 'Test iOS + Android.', dueDate: '' },
    { id: 't_4', title: 'Icon set for dashboard cards', stage: 'design_review', priority: 'low', assignee: 'Jordan', figmaLink: 'https://figma.com', description: '12 line icons.', dueDate: '' },
    { id: 't_5', title: 'Refresh footer links + legal', stage: 'backlog', priority: 'low', assignee: '', figmaLink: '', description: 'Update footer nav.', dueDate: '' },
    { id: 't_6', title: 'Homepage launch banner', stage: 'done', priority: 'high', assignee: 'Aarav', figmaLink: '', description: 'Shipped to production.', dueDate: '' }
  ]
};

app.get('/api/board', (req, res) => res.json(boardData));

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  if (task && task.id) {
    const idx = boardData.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) boardData.tasks[idx] = task;
    else boardData.tasks.push(task);
  }
  res.json({ success: true, task });
});

app.patch('/api/tasks/:id/stage', (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  const task = boardData.tasks.find((t) => t.id === id);
  if (task) task.stage = stage;
  res.json({ success: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  boardData.tasks = boardData.tasks.filter((t) => t.id !== req.params.id);
  res.json({ success: true });
});

app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (name && !boardData.members.includes(name)) boardData.members.push(name);
  res.json({ success: true });
});

app.delete('/api/members/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  boardData.members = boardData.members.filter((m) => m !== name);
  boardData.tasks.forEach((t) => {
    if (t.assignee === name) t.assignee = '';
  });
  res.json({ success: true });
});

app.post('/api/clear', (req, res) => {
  boardData.tasks = [];
  res.json({ success: true });
});

export default app;
