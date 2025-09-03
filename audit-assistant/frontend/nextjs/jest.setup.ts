import '@testing-library/jest-dom';

// Silence console errors from React during tests unless explicitly needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const msg = (args?.[0] || '').toString();
    if (msg.includes('Warning:')) return; // filter React warnings
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock sonner to no-op toasts
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    message: jest.fn(),
  },
}));

// Mock Firebase auth used in api.ts
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => undefined } }),
}));
