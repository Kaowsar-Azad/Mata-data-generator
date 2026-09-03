export {};

declare global {
  interface Window {
    electronAPI?: {
      onUpscaleProgress: (callback: (data: { progress: number }) => void) => () => void;
      selectFiles: (options: any) => Promise<string[]>;
      selectFolder: () => Promise<string | undefined>;
      readFile: (path: string) => Promise<ArrayBuffer>;
      upscaleLocalNcnn: (
        path: string, 
        scale: number, 
        model: string, 
        format: string, 
        outputFolder: string,
        customSuffix?: string
      ) => Promise<{ success: boolean, path?: string, format?: string, base64?: string, error?: string, cancelled?: boolean }>;
      toggleDevTools?: () => Promise<boolean>;
      // Include any other existing API declarations here if needed, but we'll focus on what ImageUpscaler uses.
    }
  }
}
