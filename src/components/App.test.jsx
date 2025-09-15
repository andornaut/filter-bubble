import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock chrome API
global.chrome = {
  runtime: {
    connect: jest.fn(),
  },
};

const mockState = {
  hasPermissions: true,
  showHelp: false,
  errors: { list: [] },
  topics: { list: [], selected: null },
  websites: { list: [], selected: null },
};

const mockSetState = jest.fn();

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render navigation tabs', () => {
    render(<App state={mockState} setState={mockSetState} hash="#topics" />);

    const nav = screen.getByRole('navigation');
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Topics' }));
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Websites' }));
  });

  it('should show active tab class for topics', () => {
    render(<App state={mockState} setState={mockSetState} hash="#topics" />);

    const topicsLink = screen.getByRole('link', { name: 'Topics' });
    expect(topicsLink).toHaveClass('app__tab--active');
  });

  it('should show active tab class for websites', () => {
    render(<App state={mockState} setState={mockSetState} hash="#websites" />);

    const websitesLink = screen.getByRole('link', { name: 'Websites' });
    expect(websitesLink).toHaveClass('app__tab--active');
  });

  it('should show permission request when no permissions', () => {
    const stateWithoutPermissions = {
      ...mockState,
      hasPermissions: false,
    };

    render(<App state={stateWithoutPermissions} setState={mockSetState} hash="#topics" />);

    expect(screen.getByText('Click to request required permissions!')).toBeInTheDocument();
  });

  it('should not show permission request when permissions granted', () => {
    render(<App state={mockState} setState={mockSetState} hash="#topics" />);

    expect(screen.queryByText('Click to request required permissions!')).not.toBeInTheDocument();
  });
});
