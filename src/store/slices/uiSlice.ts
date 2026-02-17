import type { StoreSlice, UISlice } from '../types';

const getInitialTheme = (): 'light' | 'dark' => {
    const storageTheme = typeof globalThis.localStorage !== 'undefined'
        ? globalThis.localStorage.getItem('theme')
        : null;

    if (storageTheme === 'light' || storageTheme === 'dark') {
        return storageTheme;
    }

    const prefersDark = typeof globalThis.window !== 'undefined'
        && typeof globalThis.window.matchMedia === 'function'
        && globalThis.window.matchMedia('(prefers-color-scheme: dark)').matches;

    return prefersDark ? 'dark' : 'light';
};

export const createUISlice: StoreSlice<UISlice> = (set) => ({
    theme: getInitialTheme(),
    modal: {
        isOpen: false,
        type: 'alert',
        message: '',
    },

    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        if (typeof globalThis.localStorage !== 'undefined') {
            globalThis.localStorage.setItem('theme', newTheme);
        }
        return { theme: newTheme };
    }),

    openModal: (params) => set({ modal: { ...params, isOpen: true } }),
    closeModal: () => set({ modal: { isOpen: false, type: 'alert', message: '' } }),
});
