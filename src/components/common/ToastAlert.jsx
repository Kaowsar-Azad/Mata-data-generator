import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';

export function ToastAlert({ message, isVisible, onClose }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] min-w-[320px] max-w-md w-full"
        >
          <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 flex items-start gap-4 backdrop-blur-xl bg-opacity-95 dark:bg-opacity-95">
            <div className="bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 p-2 rounded-xl shrink-0">
              <AlertCircle size={24} strokeWidth={2.5} />
            </div>
            
            <div className="flex-1 pt-0.5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-[15px]">
                API Key Required
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 leading-relaxed">
                {message}
              </p>
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
