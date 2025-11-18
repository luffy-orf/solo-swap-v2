import { Settings, X } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>settings</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">provider</label>
            <select className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option>helius</option>
              <option>quicknode</option>
              <option>public</option>
            </select>
          </div>

          {/* <div>
            <label className="block text-sm font-medium mb-2">theme</label>
            <select className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option>dark</option>
              <option>light</option>
              <option>system</option>
            </select>
          </div> */}

          <div>
            <label className="block text-sm font-medium mb-2">refresh interval</label>
            <select className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option>30 seconds</option>
              <option>1 minute</option>
              <option>5 minutes</option>
              {/* <option>manual</option> */}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}