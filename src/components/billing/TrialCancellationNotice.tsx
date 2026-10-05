import { CalendarClock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface TrialCancellationNoticeProps {
  trialEndsAt: string;
  cancelAtPeriodEnd: boolean;
  isPrimaryAdmin: boolean;
  isOpeningPortal: boolean;
  onManageSubscription: () => void;
}

export const TrialCancellationNotice = ({
  trialEndsAt,
  cancelAtPeriodEnd,
  isPrimaryAdmin,
  isOpeningPortal,
  onManageSubscription,
}: TrialCancellationNoticeProps) => {
  const formattedTrialEnd = format(new Date(trialEndsAt), "MMMM d, yyyy 'at' h:mm a");

  return (
    <Alert className="border-primary/40 bg-primary/10">
      <CalendarClock className="h-4 w-4 text-primary" />
      <AlertTitle className="text-dashboard-text">
        {cancelAtPeriodEnd ? "Trial cancellation scheduled" : "Your free trial ends soon"}
      </AlertTitle>
      <AlertDescription className="space-y-3 text-dashboard-text-secondary">
        {cancelAtPeriodEnd ? (
          <p>
            Your trial is scheduled to end on {formattedTrialEnd} local time. You will not be charged for the first paid term.
          </p>
        ) : (
          <>
            <p>
              Cancel before {formattedTrialEnd} local time to avoid the first charge.
            </p>
            <p>
              {isPrimaryAdmin
                ? "Select Manage Subscription to Cancel below, then choose Cancel subscription in Stripe."
                : "Ask your company's primary administrator to cancel the trial."}
            </p>
          </>
        )}

        {isPrimaryAdmin && (
          <Button
            type="button"
            variant="outline"
            onClick={onManageSubscription}
            disabled={isOpeningPortal}
            className="border-primary/40 bg-dashboard-card text-dashboard-text hover:bg-dashboard-bg"
          >
            {isOpeningPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {cancelAtPeriodEnd ? "Review Cancellation in Stripe" : "Manage Subscription to Cancel"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
