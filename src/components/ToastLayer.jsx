import React from 'react';
import { useToast } from '../providers/ToastProvider.jsx';
import { Info, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function ToastLayer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-8 right-8 z-[40] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let colorClass = 'border-blue-500 text-blue-400';
        
        if (toast.type === 'error') {
          Icon = XCircle;
          colorClass = 'border-red-500 text-red-400';
        } else if (toast.type === 'success') {
          Icon = CheckCircle;
          colorClass = 'border-green-500 text-green-400';
        } else if (toast.type === 'warning') {
          Icon = AlertCircle;
          colorClass = 'border-yellow-500 text-yellow-400';
        }

        return (
          <div 
            key={toast.id}
            className={`flex items-center gap-3 bg-[#111116]/95 backdrop-blur-md border-l-4 ${colorClass} px-4 py-3 rounded shadow-2xl transform transition-all duration-300 pointer-events-auto`}
            style={{
              animation: 'toast-slide-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
            }}
          >
            <style>{`
              @keyframes toast-slide-in {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            `}</style>
            <Icon size={20} />
            <span className="text-white text-sm font-medium">{toast.message}</span>
            <button 
              onClick={() => removeToast(toast.id)}
              className="ml-4 text-gray-500 hover:text-white transition-colors"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
