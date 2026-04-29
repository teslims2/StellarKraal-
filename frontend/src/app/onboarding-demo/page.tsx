import { useState } from 'react';
import OnboardingModal from '../components/OnboardingModal';
import HelpMenu from '../components/HelpMenu';
import { useOnboarding } from '../hooks/useOnboarding';

export default function OnboardingDemo() {
  const { showOnboarding, openOnboarding, closeOnboarding } = useOnboarding();

  return (
    <div className="min-h-screen bg-cream-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-brown-700">StellarKraal Onboarding Demo</h1>
          <HelpMenu onShowOnboarding={openOnboarding} />
        </div>
        
        <div className="bg-cream-50 rounded-2xl p-6 shadow">
          <h2 className="text-xl font-semibold text-brown-700 mb-4">Demo Features</h2>
          <ul className="space-y-2 text-brown-600">
            <li>✅ 3-step onboarding modal with illustrations</li>
            <li>✅ Skip/dismiss functionality on every step</li>
            <li>✅ Completion state persisted in localStorage</li>
            <li>✅ Help menu to re-access onboarding</li>
            <li>✅ Responsive design with StellarKraal branding</li>
          </ul>
          
          <div className="mt-6">
            <button
              onClick={openOnboarding}
              className="bg-brown-600 text-cream-50 px-4 py-2 rounded-lg hover:bg-brown-700 transition"
            >
              Show Onboarding
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('stellarkraal_onboarding_completed');
                window.location.reload();
              }}
              className="ml-3 bg-gold-600 text-cream-50 px-4 py-2 rounded-lg hover:bg-gold-700 transition"
            >
              Reset & Reload (First-time User)
            </button>
          </div>
        </div>
        
        <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />
      </div>
    </div>
  );
}
