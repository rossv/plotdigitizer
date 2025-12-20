import React from 'react';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-screen w-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
            {children}
        </div>
    );
};
