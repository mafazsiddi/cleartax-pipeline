import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage({ title = 'Page not found', message = "The page you're looking for doesn't exist or may have been moved." }) {
  return (
    <div className="notfound">
      <div className="notfound-scene">
        <span className="notfound-digit">4</span>
        <span className="notfound-compass"><Compass size={40} strokeWidth={1.4} /></span>
        <span className="notfound-digit notfound-digit-2">4</span>
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      <Link className="btn primary" to="/">Back to your projects</Link>
    </div>
  );
}
