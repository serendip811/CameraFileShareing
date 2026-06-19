import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App, { getCameraAccessErrorMessage } from './App';
import { CameraAccessError } from './qr/qrScanner';

describe('App', () => {
  it('lets the user choose send or receive mode', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(screen.getByText('Camera receiver')).toBeInTheDocument();
  });

  it('renders sender file controls from home', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('heading', { name: 'Sender' })).toBeInTheDocument();
    expect(screen.getByLabelText('Choose file to send')).toBeInTheDocument();
    expect(screen.getByText('Choose a file up to 1MB.')).toBeInTheDocument();
  });

  it('renders receiver camera controls from home', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan one frame' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeInTheDocument();
  });

  it('maps camera access errors to actionable messages', () => {
    expect(getCameraAccessErrorMessage(new CameraAccessError('insecure-context', 'blocked'))).toContain(
      'Use HTTPS or localhost',
    );
    expect(getCameraAccessErrorMessage(new CameraAccessError('permission-denied', 'denied'))).toContain(
      'Allow camera access',
    );
    expect(getCameraAccessErrorMessage(new Error('boom'))).toBe('Could not open the camera. Try again.');
  });
});
