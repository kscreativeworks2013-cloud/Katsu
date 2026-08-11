import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

// Pattern: component tests. Query by accessible role and label the way a user
// would find the element — never by CSS class or test id unless there is no
// accessible handle. Drive interaction with `userEvent`, not `fireEvent`, so
// the full event sequence (focus, keydown, input) is exercised.
describe('<App />', () => {
  it('shows the generic greeting before a name is entered', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello there!');
  });

  it('greets the user as they type', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/your name/i), 'Katsu');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello, Katsu!');
  });

  it('counts clicks and pluralizes the label', async () => {
    const user = userEvent.setup();
    render(<App />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('0 clicks');

    await user.click(button);
    expect(button).toHaveTextContent('1 click');

    await user.click(button);
    expect(button).toHaveTextContent('2 clicks');
  });
});
