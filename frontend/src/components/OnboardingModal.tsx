"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import FocusTrap from "focus-trap-react";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ONBOARDING_STEPS = [
  {
    target: "collateral",
    title: "Register Collateral",
    description: "Add your livestock as collateral. Each animal is appraised and recorded on-chain to back your loan.",
    action: "Next",
    actionHref: "/borrow",
    illustration: null,
  },
  {
    target: "loan",
    title: "Request a Loan",
    description: "Request a loan against your registered collateral and review the transaction before signing.",
    action: "Next",
    actionHref: "/borrow",
    illustration: null,
  },
  {
    target: "health-factor",
    title: "Monitor Health Factor",
    description: "Monitor your health factor to understand borrowing safety and act before liquidation risk increases.",
    action: "Finish",
    actionHref: null,
    illustration: null,
  },
];

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const triggerRef = useRef<Element | null>(null);

  // Reset to first step each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      triggerRef.current = document.activeElement;
    } else {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSpotlight(null);
      return;
    }

    const target = document.querySelector(`[data-onboarding-target="${ONBOARDING_STEPS[currentStep].target}"]`);
    if (!target) {
      setSpotlight(null);
      return;
    }

    const updateSpotlight = () => setSpotlight(target.getBoundingClientRect());
    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [currentStep, isOpen]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem("stellarkraal_onboarding_completed", "true");
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem("stellarkraal_onboarding_completed", "true");
    onClose();
  };

  const handlePrimaryAction = () => {
    const step = ONBOARDING_STEPS[currentStep];
    if (step.actionHref) {
      handleComplete();
      router.push(step.actionHref);
    } else {
      handleNext();
    }
  };

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLast = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <FocusTrap active={isOpen} focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: false }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="fixed inset-0 bg-brown-900/80 flex items-center justify-center z-50 p-4"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            handleSkip();
          }
        }}
      >
        {spotlight ? (
          <>
            <div className="fixed inset-x-0 top-0 bg-brown-900/80 pointer-events-none" style={{ height: spotlight.top }} />
            <div
              className="fixed inset-y-0 left-0 bg-brown-900/80 pointer-events-none"
              style={{ width: spotlight.left, top: spotlight.top, height: spotlight.height }}
            />
            <div
              className="fixed inset-y-0 right-0 bg-brown-900/80 pointer-events-none"
              style={{ left: spotlight.right, top: spotlight.top, height: spotlight.height }}
            />
            <div className="fixed inset-x-0 bottom-0 bg-brown-900/80 pointer-events-none" style={{ top: spotlight.bottom }} />
            <div
              data-testid="onboarding-spotlight"
              className="fixed rounded-xl border-2 border-gold pointer-events-none"
              style={{
                left: spotlight.left - 6,
                top: spotlight.top - 6,
                width: spotlight.width + 12,
                height: spotlight.height + 12,
              }}
            />
          </>
        ) : (
          <div className="fixed inset-0 bg-brown-900/80 pointer-events-none" />
        )}
        <div className="bg-cream-50 dark:bg-brown-800 rounded-2xl max-w-md w-full p-6 relative">
          <button
            onClick={handleSkip}
            aria-label="Close onboarding"
            className="absolute top-4 right-4 text-brown-500 hover:text-brown-700 dark:text-brown-300 dark:hover:text-brown-100 text-xl leading-none"
          >
            ×
          </button>

        <div className="text-center">
          <div className="mb-6 text-gold-600">{step.illustration}</div>

          <h2 id="onboarding-title" className="text-2xl font-bold text-brown-700 dark:text-cream-50 mb-3">
            {step.title}
          </h2>

          <p className="text-brown-600 dark:text-brown-300 mb-8">{step.description}</p>

          {/* Step indicators */}
          <div className="flex justify-center mb-6" role="tablist" aria-label="Onboarding progress">
            {ONBOARDING_STEPS.map((_, index) => (
              <div
                key={index}
                role="tab"
                aria-selected={index === currentStep}
                aria-label={`Step ${index + 1} of ${ONBOARDING_STEPS.length}`}
                className={`w-2 h-2 rounded-full mx-1 ${
                  index === currentStep ? "bg-gold-600" : "bg-gold-200"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-2 text-brown-600 dark:text-brown-300 border border-brown-300 dark:border-brown-600 rounded-lg hover:bg-brown-50 dark:hover:bg-brown-700 transition"
            >
              Skip
            </button>
            <button
              onClick={isLast ? handlePrimaryAction : handleNext}
              className="flex-1 px-4 py-2 bg-brown-600 text-cream-50 rounded-lg hover:bg-brown-700 transition"
            >
              {isLast ? step.action : "Next"}
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-2 text-brown-600 dark:text-brown-300 border border-brown-300 dark:border-brown-600 rounded-lg hover:bg-brown-50 dark:hover:bg-brown-700 transition"
            >
              Close
            </button>
          </div>
        </div>
        </div>
      </div>
    </FocusTrap>
  );
}
