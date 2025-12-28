import { useState, useEffect } from "react";
import type { RouteState, VoiceStatus, User } from "@/types/stocker";

// Components
import { RouteHeader } from "@/components/stocker/RouteHeader";
import { CurrentItemCard } from "@/components/stocker/CurrentItemCard";
import { VoiceStatusBar } from "@/components/stocker/VoiceStatusBar";
import { AIResponseZone } from "@/components/stocker/AIResponseZone";
import { CompletedList } from "@/components/stocker/CompletedList";
import { BottomNav } from "@/components/stocker/BottomNav";
import { LoginScreen } from "@/components/stocker/LoginScreen";
import { ResumeDialog } from "@/components/stocker/ResumeDialog";
import { OfflineBanner } from "@/components/stocker/OfflineBanner";
import { ErrorBanner } from "@/components/stocker/ErrorBanner";
import { UploadTab } from "@/components/stocker/UploadTab";

// Mock data for demonstration
const mockRouteState: RouteState = {
  routeName: "South",
  routeDate: "2024-01-15",
  totalMachines: 7,
  currentMachineIndex: 2,
  currentMachineName: "Building A - Machine 1",
  currentItem: {
    product: "Doritos Nacho Cheese",
    quantity: 3,
    slot: "A-58",
    slot_spoken: "slot 58",
  },
  completedItems: [
    { product: "Cheetos Crunchy", quantity: 2, slot: "A-42" },
    { product: "Lay's Classic", quantity: 4, slot: "A-15" },
    { product: "Snickers Bar", quantity: 6, slot: "B-22" },
  ],
  completed: false,
};

const mockUser: User = {
  id: "1",
  email: "worker@stocker.ai",
  first_name: "Marcus",
};

export default function Index() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [routeState, setRouteState] = useState<RouteState | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [lastInput, setLastInput] = useState("");
  const [aiResponse, setAiResponse] = useState("Waiting for command...");
  const [activeTab, setActiveTab] = useState<"voice" | "upload">("voice");
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState("");
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Simulate online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // For demo - auto-login and simulate live voice interaction
  useEffect(() => {
    // Initial state
    setUser(mockUser);
    setIsAuthenticated(true);
    setRouteState(mockRouteState);
    setVoiceStatus("listening");
    setAiResponse("Resumed. 3 Doritos, slot 58");

    // Simulate voice interaction cycle
    const cycle = () => {
      // User says something
      setTimeout(() => {
        setLastInput("got it");
        setVoiceStatus("thinking");
      }, 3000);

      // AI processes and speaks
      setTimeout(() => {
        setVoiceStatus("speaking");
        setAiResponse("Next up, 2 Pepsi, slot 61");
      }, 4000);

      // Update to next item
      setTimeout(() => {
        setVoiceStatus("listening");
        setRouteState(prev => prev ? {
          ...prev,
          currentMachineIndex: 2,
          currentItem: { product: "Pepsi", quantity: 2, slot: "A-61", slot_spoken: "slot 61" },
          completedItems: [
            ...mockRouteState.completedItems,
            { product: "Doritos Nacho Cheese", quantity: 3, slot: "A-58" },
          ],
        } : null);
        setLastInput("");
      }, 5500);

      // Reset for next cycle
      setTimeout(() => {
        setAiResponse("2 Pepsi, slot 61");
      }, 6000);
    };

    const timer = setTimeout(cycle, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDemoLogin = () => {
    setUser(mockUser);
    setIsAuthenticated(true);
    // Simulate checking for saved session
    setTimeout(() => {
      setShowResumeDialog(true);
    }, 500);
  };

  const handleLogin = async (email: string, password: string) => {
    // Simulate login
    await new Promise((resolve) => setTimeout(resolve, 1000));
    handleDemoLogin();
  };

  const handleSignup = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    // Simulate signup
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({ id: "new", email, first_name: firstName, last_name: lastName });
    setIsAuthenticated(true);
  };

  const handleForgotPassword = async (email: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    setRouteState(null);
    setVoiceStatus("idle");
    setLastInput("");
    setAiResponse("Waiting for command...");
  };

  const handleResume = () => {
    setShowResumeDialog(false);
    setRouteState(mockRouteState);
    setVoiceStatus("listening");
    setAiResponse("Resumed. 3 Doritos, slot 58");
    setLastInput("");
    
    // Simulate voice interaction
    setTimeout(() => {
      setLastInput("got it");
      setVoiceStatus("thinking");
    }, 2000);
    
    setTimeout(() => {
      setVoiceStatus("speaking");
      setAiResponse("Next up, 2 Pepsi, slot 61");
    }, 3000);
    
    setTimeout(() => {
      setVoiceStatus("listening");
      setRouteState(prev => prev ? {
        ...prev,
        currentItem: { product: "Pepsi", quantity: 2, slot: "A-61", slot_spoken: "slot 61" },
        completedItems: [...prev.completedItems, { product: "Doritos Nacho Cheese", quantity: 3, slot: "A-58" }],
      } : null);
    }, 4500);
  };

  const handleStartFresh = () => {
    setShowResumeDialog(false);
    setRouteState({
      routeName: null,
      routeDate: null,
      totalMachines: 0,
      currentMachineIndex: 0,
      currentMachineName: null,
      currentItem: null,
      completedItems: [],
      completed: false,
    });
    setVoiceStatus("listening");
    setAiResponse('Say "start my route" to begin');
  };

  const handlePause = () => {
    setIsPaused(true);
    setVoiceStatus("paused");
  };

  const handleResumeVoice = () => {
    setIsPaused(false);
    setVoiceStatus("listening");
  };

  const handleStop = () => {
    // Would show confirm dialog in real app
    setRouteState(null);
    setVoiceStatus("idle");
    setAiResponse("Route stopped. Progress saved.");
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onSignup={handleSignup}
        onForgotPassword={handleForgotPassword}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] overflow-hidden">
      {/* Banners */}
      <OfflineBanner isVisible={!isOnline} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Resume Dialog */}
      {showResumeDialog && (
        <ResumeDialog
          routeName={mockRouteState.routeName || ""}
          machineIndex={mockRouteState.currentMachineIndex}
          totalMachines={mockRouteState.totalMachines}
          onResume={handleResume}
          onStartFresh={handleStartFresh}
        />
      )}

      {/* Zone 1: Route Header */}
      <RouteHeader
        routeState={routeState || {
          routeName: null,
          routeDate: null,
          totalMachines: 0,
          currentMachineIndex: 0,
          currentMachineName: null,
          currentItem: null,
          completedItems: [],
          completed: false,
        }}
        userName={user?.first_name}
        onLogout={handleLogout}
      />

      {/* Main content area */}
      {activeTab === "voice" ? (
        <div className="flex flex-col flex-1 overflow-hidden pb-24">
          {/* Zone 2: Current Item */}
          <CurrentItemCard
            item={routeState?.currentItem || null}
            machineName={routeState?.currentMachineName || null}
            isRouteComplete={routeState?.completed}
          />

          {/* Zone 3: Voice Status */}
          <VoiceStatusBar
            status={voiceStatus}
            lastInput={lastInput}
            showControls={!!routeState?.routeName && !routeState?.completed}
            isPaused={isPaused}
            onPause={handlePause}
            onStop={handleStop}
            onResume={handleResumeVoice}
          />

          {/* Zone 4: AI Response */}
          <AIResponseZone
            response={aiResponse}
            isEmpty={aiResponse === "Waiting for command..."}
          />

          {/* Zone 5: Completed List */}
          <CompletedList items={routeState?.completedItems || []} />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden pb-24">
          <UploadTab />
        </div>
      )}

      {/* Zone 6: Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
