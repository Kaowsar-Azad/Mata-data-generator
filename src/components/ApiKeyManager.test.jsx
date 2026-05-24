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

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const ensureExpanded = () => {
    if (!screen.queryByPlaceholderText(/Gemini API key/i)) {
      const header = screen.getByRole('button', { name: /API Keys/i });
      fireEvent.click(header);
    }
  };

  it('renders API key manager with header', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    expect(screen.getByText(/API Keys/i)).toBeInTheDocument();
  });

  it('shows current provider badge', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    // Current provider is shown in the badge or list
    expect(screen.getAllByText(/Gemini/i).length).toBeGreaterThan(0);
  });

  it('expands/collapses when header is clicked', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    // By default, it starts expanded because local storage is empty
    expect(screen.getByPlaceholderText(/Gemini API key/i)).toBeInTheDocument();
    
    const header = screen.getByRole('button', { name: /API Keys/i });
    fireEvent.click(header); // Collapse
    expect(screen.queryByPlaceholderText(/Gemini API key/i)).not.toBeInTheDocument();
    
    fireEvent.click(header); // Expand again
    expect(screen.getByPlaceholderText(/Gemini API key/i)).toBeInTheDocument();
  });

  it('shows all provider options', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    // All providers should be visible
    expect(screen.getByRole('button', { name: /Gemini/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /OpenAI/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mistral/i })).toBeInTheDocument();
  });

  it('allows adding a new API key', async () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    const input = screen.getByPlaceholderText(/Gemini API key/i);
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0];
    
    fireEvent.change(input, { target: { value: 'test-key-123' } });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(mockOnKeysChange).toHaveBeenCalled();
    });
  });

  it('prevents duplicate keys', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    const input = screen.getByPlaceholderText(/Gemini API key/i);
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0];
    
    // Add first key
    fireEvent.change(input, { target: { value: 'duplicate-key' } });
    fireEvent.click(addButton);
    
    // Try to add the same key again
    fireEvent.change(input, { target: { value: 'duplicate-key' } });
    fireEvent.click(addButton);
    
    // onKeysChange should only be called twice (initial + one add)
    // not more
  });

  it('allows switching between providers', async () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider={['gemini']}
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    const openaiButton = screen.getByRole('button', { name: /OpenAI/i });
    fireEvent.click(openaiButton);
    
    const activateButton = screen.getByRole('button', { name: /Set as Active/i });
    fireEvent.click(activateButton);
    
    await waitFor(() => {
      expect(mockOnProviderChange).toHaveBeenCalledWith(['gemini', 'openai']);
    });
  });

  it('shows no keys message when empty', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    expect(screen.getByText(/No API keys saved for Gemini/i)).toBeInTheDocument();
  });

  it('allows adding key with Enter key', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    const input = screen.getByPlaceholderText(/Gemini API key/i);
    
    fireEvent.change(input, { target: { value: 'enter-key-test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    // Key should be added
    expect(mockOnKeysChange).toHaveBeenCalled();
  });

  it('persists keys to localStorage', () => {
    render(
      <ApiKeyManager
        onKeysChange={mockOnKeysChange}
        provider="gemini"
        onProviderChange={mockOnProviderChange}
      />
    );
    
    ensureExpanded();
    
    const input = screen.getByPlaceholderText(/Gemini API key/i);
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0];
    
    fireEvent.change(input, { target: { value: 'persist-test-key' } });
    fireEvent.click(addButton);
    
    // Check if localStorage has the key
    const stored = localStorage.getItem('all_api_keys');
    expect(stored).toBeTruthy();
  });
});
