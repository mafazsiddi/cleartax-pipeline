import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

export default function NotFoundPage({ title = 'Page not found', message = "The page you're looking for doesn't exist or may have been moved." }) {
  return (
    <div className="notfound">
      <FileQuestion size={40} strokeWidth={1.5} />
      <h2>{title}</h2>
      <p>{message}</p>
      <Link className="btn primary" to="/">Back to your projects</Link>
    </div>
  );
}
