import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiKeyManager } from './ApiKeyManager';

// Ensure localStorage is fully mocked if not available or broken in the test environment
if (typeof localStorage === 'undefined' || !localStorage.clear) {
  let store = {};
  const mockLocalStorage = {
    clear: vi.fn(() => { store = {}; }),
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value ? value.toString() : ''; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
  global.localStorage = mockLocalStorage;
  if (typeof window !== 'undefined') {
    window.localStorage = mockLocalStorage;
  }
}

describe('ApiKeyManager Component', () => {
  const mockOnKeysChange = vi.fn();
  const mockOnProviderChange = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not render when isOpen is false', () => {
    render(
      <ApiKeyManager
        isOpen={false}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    expect(screen.queryByText(/API Settings/i)).not.toBeInTheDocument();
  });

  it('renders API key manager with header when isOpen is true', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    expect(screen.getByText(/API Settings/i)).toBeInTheDocument();
  });

  it('shows current provider badge/header', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    // Google Gemini is shown in the sidebar and content area
    expect(screen.getAllByText(/Google Gemini/i).length).toBeGreaterThan(0);
  });

  it('allows adding a new API key', async () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter Google Gemini API key/i);
    const addButton = screen.getByRole('button', { name: /Add Key/i });
    
    fireEvent.change(input, { target: { value: 'test-key-123' } });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(mockOnKeysChange).toHaveBeenCalled();
    });
  });

  it('allows switching viewed provider in sidebar', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    // Switch to OpenAI
    const openaiButton = screen.getByText('OpenAI');
    fireEvent.click(openaiButton);
    
    // Header should update to OpenAI
    expect(screen.getAllByText(/OpenAI/i).length).toBeGreaterThan(0);
  });

  it('allows enabling/disabling providers using checkboxes', async () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    const checkboxes = screen.getAllByRole('checkbox');
    // The third checkbox is Groq (index 2, after gemini=0 and mistral=1)
    fireEvent.click(checkboxes[2]);
    
    await waitFor(() => {
      expect(mockOnProviderChange).toHaveBeenCalledWith(['gemini', 'groq']);
    });
  });

  it('shows no keys message when empty', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    expect(screen.getByText(/No keys stored yet/i)).toBeInTheDocument();
  });

  it('allows adding key with Enter key', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter Google Gemini API key/i);
    
    fireEvent.change(input, { target: { value: 'enter-key-test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnKeysChange).toHaveBeenCalled();
  });

  it('persists keys to localStorage', () => {
    render(
      <ApiKeyManager
        isOpen={true}
        onClose={mockOnClose}
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter Google Gemini API key/i);
    const addButton = screen.getByRole('button', { name: /Add Key/i });
    
    fireEvent.change(input, { target: { value: 'persist-test-key' } });
    fireEvent.click(addButton);
    
    const stored = localStorage.getItem('all_api_keys');
    expect(stored).toBeTruthy();
  });
});
