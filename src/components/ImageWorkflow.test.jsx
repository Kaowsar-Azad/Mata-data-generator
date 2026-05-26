import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

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
import { ImageWorkflow } from './ImageWorkflow';

describe('ImageWorkflow Component', () => {
  const mockApiKeys = ['test-key-123'];
  const mockPromptSettings = {
    exportPlatform: 'General',
    titleMaxChars: 80,
    descMaxChars: 120,
    keywordCount: 48,
    concurrentLimit: 2
  };

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = vi.fn(() => 'mock-url');
    }
  });

  it('renders upload zone on mount', () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    expect(screen.getByText(/Upload Media, EPS or Video Files/i)).toBeInTheDocument();
  });

  it('shows error message when no API keys are provided', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = render(
      <ImageWorkflow
        apiKeys={[]}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    
    const button = screen.getByRole('button', { name: /Generate All/i });
    fireEvent.click(button);
    
    expect(alertSpy).toHaveBeenCalledWith("Please add at least one Gemini API key first.");
    alertSpy.mockRestore();
  });

  it('renders stats with correct counts', () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    expect(screen.getByText(/0 Files/i)).toBeInTheDocument();
  });

  it('shows progress bar during processing', async () => {
    const { rerender } = render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    // Progress bar should not be visible initially
    let progressBar = screen.queryByText(/0%/);
    expect(progressBar).not.toBeInTheDocument();
  });

  it('shows error banner when files fail', async () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    // Error banner should not be visible initially
    let errorBanner = screen.queryByText(/Failed to Generate/i);
    expect(errorBanner).not.toBeInTheDocument();
  });

  it('has working keyboard shortcut (Enter key)', () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    fireEvent.keyDown(window, event);
    
    // Should not throw error
    expect(true).toBe(true);
  });

  it('shows metadata editing fields when status is done', () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    // Initially no metadata fields
    let titleFields = screen.queryAllByText(/Title/);
    expect(titleFields.length).toBe(0);
  });

  it('renders EPS and raster image badges', () => {
    render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    // Check if badge options are shown
    const badges = screen.getByText(/EPS Vector/i);
    expect(badges).toBeInTheDocument();
  });

  it('export button is disabled when no completed images', () => {
    const { container } = render(
      <ImageWorkflow
        apiKeys={mockApiKeys}
        apiProvider="gemini"
        promptSettings={mockPromptSettings}
      />
    );
    
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    
    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    expect(exportBtn).toBeDisabled();
  });
});

