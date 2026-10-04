import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, FileText, Loader2, Mail, RefreshCw, Save, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/authFetch';

const API_BASE = 'https://stockerai-api.onrender.com/api';

type ReviewStatus = 'new' | 'mapping' | 'ready_for_validation' | 'ready';

interface FormatReview {
  id: string;
  account_id: string | null;
  account_name: string | null;
  account_email: string | null;
  vendor: string | null;
  filename: string | null;
  reason: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string | null;
  review_notes: string;
  pdf_available: boolean;
}

const STATUS_OPTIONS: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'new', label: 'Waiting' },
  { value: 'mapping', label: 'Being formatted' },
  { value: 'ready_for_validation', label: 'Ready to validate' },
  { value: 'ready', label: 'Approved and live' },
];

const statusLabel = (status: ReviewStatus) =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

const responseError = async (response: Response, fallback: string) => {
  try {
    const body = await response.json();
    return body.detail || body.error || fallback;
  } catch {
    return fallback;
  }
};

const AdminReportFormats = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<FormatReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [drafts, setDrafts] = useState<Record<string, { status: ReviewStatus; notes: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [testingAlert, setTestingAlert] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE}/admin/report-formats`);
      if (!response.ok) throw new Error(await responseError(response, 'Could not load report formats.'));
      const body = await response.json();
      const nextItems: FormatReview[] = body.items || [];
      setItems(nextItems);
      setDrafts(Object.fromEntries(nextItems.map((item) => [item.id, {
        status: item.status,
        notes: item.review_notes || '',
      }])));
    } catch (error) {
      toast({
        title: 'Could not load report formats',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [item.account_name, item.account_email, item.vendor, item.filename]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [items, search, statusFilter]);

  const waitingCount = items.filter((item) => item.status !== 'ready').length;

  const save = async (item: FormatReview) => {
    const draft = drafts[item.id] || { status: item.status, notes: item.review_notes };
    setSavingId(item.id);
    try {
      const response = await authFetch(`${API_BASE}/admin/report-formats/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not save this report.'));
      const saved = await response.json();
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: saved.status, review_notes: saved.review_notes, updated_at: saved.updated_at }
        : entry));
      toast({
        title: saved.status === 'ready' ? 'Format approved and uploads unlocked' : 'Report status saved',
        description: saved.status === 'ready'
          ? 'The customer can now upload this report format as a live route.'
          : undefined,
      });
    } catch (error) {
      toast({
        title: 'Could not save the report status',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const openPdf = async (item: FormatReview) => {
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;
    setOpeningId(item.id);
    try {
      const response = await authFetch(`${API_BASE}/admin/report-formats/${encodeURIComponent(item.id)}/pdf-url`);
      if (!response.ok) throw new Error(await responseError(response, 'Could not open this PDF.'));
      const body = await response.json();
      if (!popup) throw new Error('Allow pop-ups for StockerAI, then try opening the PDF again.');
      popup.location.href = body.url;
    } catch (error) {
      popup?.close();
      toast({
        title: 'Could not open the submitted PDF',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setOpeningId(null);
    }
  };

  const testAlert = async () => {
    setTestingAlert(true);
    try {
      const response = await authFetch(`${API_BASE}/admin/report-formats/test-notification`, { method: 'POST' });
      if (!response.ok) throw new Error(await responseError(response, 'Telegram did not confirm delivery.'));
      toast({ title: 'Telegram test sent', description: 'Check your Telegram conversation for the StockerAI test message.' });
    } catch (error) {
      toast({
        title: 'Telegram test failed',
        description: error instanceof Error ? error.message : 'Check the Render Telegram settings.',
        variant: 'destructive',
      });
    } finally {
      setTestingAlert(false);
    }
  };

  return (
    <AdminLayout title="Report Formats">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-5">
              <p className="text-sm text-slate-400">Needs attention</p>
              <p className="text-3xl font-bold text-amber-500">{loading ? '…' : waitingCount}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-5">
              <p className="text-sm text-slate-400">Approved formats</p>
              <p className="text-3xl font-bold text-emerald-400">{loading ? '…' : items.length - waitingCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, email, vendor, or file"
              className="border-slate-700 bg-slate-900 pl-9 text-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | ReviewStatus)}>
            <SelectTrigger className="w-full border-slate-700 bg-slate-900 text-white sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-white">
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()} className="border-slate-700 text-slate-300">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
          <Button variant="outline" disabled={testingAlert} onClick={() => void testAlert()} className="border-slate-700 text-slate-300">
            {testingAlert ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}Test Telegram
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900"><CardContent className="py-12 text-center text-slate-400">No report formats match this view.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((item) => {
              const draft = drafts[item.id] || { status: item.status, notes: item.review_notes };
              const changed = draft.status !== item.status || draft.notes !== item.review_notes;
              return (
                <Card key={item.id} className="border-slate-800 bg-slate-900">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <CardTitle className="text-lg text-white">{item.account_name || 'Unknown company'}</CardTitle>
                        <p className="mt-1 text-sm text-slate-400">{item.vendor || 'Unknown system'} · {item.filename || 'Unnamed PDF'}</p>
                      </div>
                      <Badge className={item.status === 'ready' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                        {statusLabel(item.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 text-sm sm:grid-cols-3">
                      <div><span className="block text-slate-500">Submitted by</span><span className="text-slate-200">{item.account_email || 'Unknown'}</span></div>
                      <div><span className="block text-slate-500">Received</span><span className="text-slate-200">{new Date(item.created_at).toLocaleString()}</span></div>
                      <div><span className="block text-slate-500">Reason</span><span className="text-slate-200">{item.reason || 'New format'}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!item.pdf_available || openingId === item.id} onClick={() => void openPdf(item)} className="border-slate-700 text-slate-200">
                        {openingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Open PDF
                      </Button>
                      {item.account_email && (
                        <Button variant="outline" asChild className="border-slate-700 text-slate-200">
                          <a href={`mailto:${encodeURIComponent(item.account_email)}?subject=${encodeURIComponent('Your StockerAI report format')}`}><Mail className="mr-2 h-4 w-4" />Email customer</a>
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Status</Label>
                        <Select value={draft.status} onValueChange={(value) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, status: value as ReviewStatus } }))}>
                          <SelectTrigger className="border-slate-700 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="border-slate-700 bg-slate-900 text-white">
                            {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Internal notes</Label>
                        <Textarea
                          value={draft.notes}
                          maxLength={5000}
                          onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, notes: event.target.value } }))}
                          placeholder="Mapping details, test results, or what remains"
                          className="min-h-24 border-slate-700 bg-slate-950 text-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button disabled={!changed || savingId === item.id} onClick={() => void save(item)} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                        {savingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminReportFormats;
