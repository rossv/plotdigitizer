
import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { AlertTriangle, HelpCircle, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

export const GlobalModal: React.FC = () => {
    const { modal, closeModal } = useStore();
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (modal.isOpen && modal.type === 'prompt') {
            setInputValue(modal.defaultValue || '');
            // Focus input after a short delay to allow render
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [modal.isOpen, modal.type, modal.defaultValue]);

    if (!modal.isOpen) return null;

    const handleConfirm = () => {
        if (modal.type === 'prompt') {
            modal.onConfirm?.(inputValue);
        } else {
            modal.onConfirm?.();
        }
        closeModal();
    };

    const handleCancel = () => {
        modal.onCancel?.();
        closeModal();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    const getIcon = () => {
        switch (modal.type) {
            case 'alert':
                return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
            case 'confirm':
                return <HelpCircle className="w-6 h-6 text-blue-500" />;
            case 'prompt':
                return <MessageSquare className="w-6 h-6 text-indigo-500" />;
            default:
                return null;
        }
    };

    const getTitle = () => {
        if (modal.title) return modal.title;
        switch (modal.type) {
            case 'alert': return 'Alert';
            case 'confirm': return 'Confirm';
            case 'prompt': return 'Input Required';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={handleCancel}
            />

            {/* Modal Content */}
            <div
                className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden transform transition-all scale-100 opacity-100"
                onKeyDown={handleKeyDown}
            >
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={clsx(
                            "p-3 rounded-full shrink-0",
                            modal.type === 'alert' && "bg-yellow-100 dark:bg-yellow-900/30",
                            modal.type === 'confirm' && "bg-blue-100 dark:bg-blue-900/30",
                            modal.type === 'prompt' && "bg-indigo-100 dark:bg-indigo-900/30",
                        )}>
                            {getIcon()}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                                {getTitle()}
                            </h3>
                            <p className="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                                {modal.message}
                            </p>

                            {modal.type === 'prompt' && (
                                <div className="mb-4">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                                        placeholder="Enter value..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-2">
                        {modal.type !== 'alert' && (
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
                            >
                                {modal.cancelLabel || 'Cancel'}
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            className={clsx(
                                "px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors",
                                modal.type === 'alert' ? "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500" :
                                    modal.type === 'confirm' ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500" :
                                        "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                            )}
                        >
                            {modal.confirmLabel || (modal.type === 'alert' ? 'OK' : 'Confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
