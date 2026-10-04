import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  FileCheck2,
  FolderOpen,
  Headphones,
  HelpCircle,
  Loader2,
  Mic,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { supabase } from '@/integrations/supabase/client';
import { authFetch } from '@/lib/authFetch';
import {
  formatSubmissionVendor,
  REPORT_SOURCE_OPTIONS,
  routeFileNameExample,
  type ReportSource,
} from '@/lib/onboarding';

const GettingStarted = () => {
  const { user, userRole } = useAuth();
  const onboarding = useOnboardingStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<ReportSource | ''>('');
  const [sourceName, setSourceName] = useState('');
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleSubmitted, setSampleSubmitted] = useState(false);
  const [submittingSample, setSubmittingSample] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalSteps = onboarding.isAdmin ? 3 : 2;

  useEffect(() => {
    if (onboarding.reportSource) setSource(onboarding.reportSource);
    if (onboarding.reportSourceName) setSourceName(onboarding.reportSourceName);
    if (['submitted', 'mapping', 'ready_for_validation'].includes(onboarding.reportFormatStatus || '')) {
      setSampleSubmitted(true);
    }
  }, [onboarding.reportFormatStatus, onboarding.reportSource, onboarding.reportSourceName]);

  const needsSample = source === 'other' || source === 'not_sure';
  const sourceLabel = useMemo(
    () => REPORT_SOURCE_OPTIONS.find((option) => option.value === source)?.title,
    [source],
  );

  const saveSource = async () => {
    if (!userRole?.account_id || !source) throw new Error('Choose where your report comes from.');
    const normalizedSourceName = source === 'parlevel' ? '' : sourceName.trim();
    const sourceUnchanged = source === onboarding.reportSource
      && normalizedSourceName === onboarding.reportSourceName;
    const existingIntakeStatus = sourceUnchanged
      && ['submitted', 'mapping', 'ready_for_validation'].includes(onboarding.reportFormatStatus || '')
      ? onboarding.reportFormatStatus
      : null;
    const { error } = await supabase
      .from('accounts')
      .update({
        report_source: source,
        report_source_name: source === 'parlevel' ? null : normalizedSourceName || null,
        report_format_status: source === 'parlevel' ? 'ready' : existingIntakeStatus || 'needs_submission',
      })
      .eq('id', userRole.account_id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
  };

  const continueFromSource = async () => {
    if (!source) {
      toast({ title: 'Choose your report source', variant: 'destructive' });
      return;
    }
    if (source === 'other' && !sourceName.trim()) {
      toast({ title: 'Enter the name of your vending system', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await saveSource();
      setStep(2);
    } catch (error) {
      toast({
        title: 'We could not save that choice',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitSample = async () => {
    if (!sampleFile || !user || !source) {
      toast({ title: 'Choose a representative PDF first', variant: 'destructive' });
      return;
    }
    setSubmittingSample(true);
    try {
      const body = new FormData();
      body.append('pdf', sampleFile);
      body.append('date', format(new Date(), 'yyyy-MM-dd'));
      body.append('user_id', user.id);
      body.append('vendor', formatSubmissionVendor(source, sourceName));
      body.append('format_submission', 'true');
      body.append('operation_id', crypto.randomUUID());

      const response = await authFetch('https://stockerai-api.onrender.com/api/upload-pdf', {
        method: 'POST',
        body,
      });
      if (!response.ok) throw new Error('The sample could not be submitted. Please try again.');
      const result = await response.json();
      if (result.status !== 'pending_format') {
        throw new Error('The sample was not placed in the format-review queue.');
      }
      if (userRole?.account_id) {
        const { error: statusError } = await supabase
          .from('accounts')
          .update({ report_format_status: 'submitted' })
          .eq('id', userRole.account_id);
        if (statusError) throw statusError;
        await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      }
      setSampleSubmitted(true);
      toast({
        title: 'Report received',
        description: 'This is a format submission, not a live route. We will email you when it is ready to validate.',
      });
    } catch (error) {
      toast({
        title: 'We could not submit the report',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingSample(false);
    }
  };

  const finish = async () => {
    if (!user || !userRole) return;
    if (onboarding.isAdmin && needsSample && !sampleSubmitted) {
      toast({ title: 'Submit a representative PDF before finishing', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (onboarding.isAdmin) {
        await saveSource();
        const { error } = await supabase
          .from('accounts')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', userRole.account_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      navigate(onboarding.isAdmin && source === 'parlevel' ? '/dashboard/upload-routes' : '/dashboard/my-routes');
    } catch (error) {
      toast({
        title: 'We could not finish setup',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (onboarding.isLoading) {
    return (
      <DashboardLayout title="Getting Started">
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Getting Started"
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Getting Started' }]}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-dashboard-text-secondary">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        {onboarding.isAdmin && step === 1 && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">What system produces your route-picking PDF?</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                We save this for your company, so you do not have to answer it for every route.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RadioGroup value={source} onValueChange={(value) => {
                setSource(value as ReportSource);
                if (value !== onboarding.reportSource) setSampleSubmitted(false);
              }}>
                {REPORT_SOURCE_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`source-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashboard-border p-4 hover:border-primary/60"
                  >
                    <RadioGroupItem
                      id={`source-${option.value}`}
                      value={option.value}
                      aria-label={option.title}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-dashboard-text">{option.title}</span>
                      <span className="block text-sm font-normal text-dashboard-text-secondary">{option.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {source === 'other' && (
                <div className="space-y-2">
                  <Label htmlFor="source-name" className="text-dashboard-text">Vending system name</Label>
                  <Input
                    id="source-name"
                    value={sourceName}
                    onChange={(event) => {
                      setSourceName(event.target.value);
                      if (event.target.value.trim() !== onboarding.reportSourceName) setSampleSubmitted(false);
                    }}
                    placeholder="For example: Nayax, Cantaloupe, VendSoft"
                    className="border-dashboard-border bg-dashboard-bg text-dashboard-text"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={continueFromSource} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {onboarding.isAdmin && step === 2 && source === 'parlevel' && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">Create your phone-ready route folder</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                Google Drive is your route staging folder. StockerAI opens it through your phone's file picker.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 text-dashboard-text">
              {[
                [Cloud, 'Open Google Drive', 'Use the same Google account that is available on the route phone.'],
                [FolderOpen, 'Create a folder named “StockerAI Routes”', 'Keep current route PDFs together and easy to find from the phone.'],
                [FileCheck2, 'Export the Machine View Only PDF', 'In Parlevel, use Machine View Only. If it appears inside Prekitting Detail, select Machine View Only before downloading.'],
                [Upload, 'Name and save the route', `Use Route Name - YYYY-MM-DD.pdf, for example ${routeFileNameExample('South Route', format(new Date(), 'yyyy-MM-dd'))}, then save it in StockerAI Routes.`],
              ].map(([Icon, title, description], index) => {
                const StepIcon = Icon as typeof Cloud;
                return (
                  <div key={String(title)} className="flex gap-4 rounded-lg border border-dashboard-border p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{index + 1}. {String(title)}</p>
                      <p className="text-sm text-dashboard-text-secondary">{String(description)}</p>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-dashboard-text-secondary">
                Before accepting an import, compare StockerAI's route, machine, and item totals with the PDF.
              </div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                <Button onClick={() => setStep(3)}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {onboarding.isAdmin && step === 2 && needsSample && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">Submit a representative report</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                This teaches us the structure of {sourceLabel === 'Another vending system' ? sourceName : 'your report'}. It does not create a live route.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-dashboard-text-secondary">
                Choose a normal PDF containing the route, locations or machines, products, and pick quantities. Remove anything you do not want reviewed.
              </div>
              <div className="space-y-2">
                <Label htmlFor="sample-report" className="text-dashboard-text">Representative PDF</Label>
                <Input
                  id="sample-report"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={sampleSubmitted}
                  onChange={(event) => {
                    setSampleFile(event.target.files?.[0] || null);
                    setSampleSubmitted(false);
                  }}
                  className="border-dashboard-border bg-dashboard-bg text-dashboard-text"
                />
              </div>
              {sampleSubmitted ? (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-dashboard-text">
                  <Check className="h-5 w-5 text-green-500" />
                  Report received. We will email you when the format is ready for validation.
                </div>
              ) : (
                <Button onClick={submitSample} disabled={!sampleFile || submittingSample}>
                  {submittingSample ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Submit for format setup
                </Button>
              )}
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                <Button onClick={() => setStep(3)} disabled={!sampleSubmitted}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {onboarding.isAdmin && step === 3 && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">Your company setup is ready</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                {source === 'parlevel'
                  ? 'Upload one short route, compare its totals with the PDF, assign it, and run it on a phone before using a full production route.'
                  : 'Your report is in the format-review queue. You can invite your team now; route uploads begin after the first format is validated.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-dashboard-border p-4">
                  <Smartphone className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-semibold text-dashboard-text">Test on the real phone</p>
                  <p className="text-sm text-dashboard-text-secondary">Verify browser and installed app behavior separately.</p>
                </div>
                <div className="rounded-lg border border-dashboard-border p-4">
                  <Headphones className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-semibold text-dashboard-text">Test audio and fallback</p>
                  <p className="text-sm text-dashboard-text-secondary">Check speaker, Bluetooth, microphone permission, and touch controls.</p>
                </div>
              </div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                <Button onClick={finish} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {source === 'parlevel' ? 'Finish and upload a route' : 'Finish setup'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!onboarding.isAdmin && step === 1 && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">Set up your route phone</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">A two-minute check before your first route prevents most audio surprises.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                [Smartphone, 'Open StockerAI on the phone you will use during the route.'],
                [Mic, 'Allow microphone access when the browser or installed app asks.'],
                [Headphones, 'Connect Bluetooth earbuds now if you plan to use them, and confirm spoken audio is audible.'],
              ].map(([Icon, copy]) => {
                const StepIcon = Icon as typeof Smartphone;
                return <div key={String(copy)} className="flex items-center gap-3 rounded-lg border border-dashboard-border p-4 text-dashboard-text"><StepIcon className="h-5 w-5 shrink-0 text-primary" /><span>{String(copy)}</span></div>;
              })}
              <div className="flex justify-end"><Button onClick={() => setStep(2)}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
            </CardContent>
          </Card>
        )}

        {!onboarding.isAdmin && step === 2 && (
          <Card className="border-dashboard-border bg-dashboard-card">
            <CardHeader>
              <CardTitle className="text-dashboard-text">How picking works</CardTitle>
              <CardDescription className="text-dashboard-text-secondary">Your administrator assigns routes. StockerAI guides the work and asks a focused question when it needs clarification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-dashboard-text">
              <div className="rounded-lg border border-dashboard-border p-4"><strong>Voice first:</strong> listen for the item, quantity, and machine prompt before responding.</div>
              <div className="rounded-lg border border-dashboard-border p-4"><strong>Touch is always available:</strong> use the on-screen controls if the route is noisy or the microphone disconnects.</div>
              <div className="rounded-lg border border-dashboard-border p-4"><strong>Connection loss is recoverable:</strong> stop moving through items, restore the connection, and confirm the screen before continuing.</div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                <Button onClick={finish} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Finish setup</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-2 text-sm text-dashboard-text-secondary">
          <HelpCircle className="h-4 w-4" />
          You can reopen Getting Started from the dashboard menu at any time.
        </div>
      </div>
    </DashboardLayout>
  );
};

export default GettingStarted;
