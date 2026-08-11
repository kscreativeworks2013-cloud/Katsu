import { useState } from 'react';
import { formatGreeting, pluralize } from './lib/format';

export default function App() {
  const [name, setName] = useState('');
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>{formatGreeting(name)}</h1>

      <label htmlFor="name">
        Your name
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Katsu"
        />
      </label>

      <button onClick={() => setCount((current) => current + 1)}>
        {pluralize(count, 'click')}
      </button>
    </main>
  );
}
