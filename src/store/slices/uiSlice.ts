import type { StoreSlice, UISlice } from '../types';

export const createUISlice: StoreSlice<UISlice> = (set) => ({
    theme: (localStorage.getItem('theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    modal: {
        isOpen: false,
        type: 'alert',
        message: '',
    },

    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        return { theme: newTheme };
    }),

    openModal: (params) => set({ modal: { ...params, isOpen: true } }),
    closeModal: () => set({ modal: { isOpen: false, type: 'alert', message: '' } }),
});
