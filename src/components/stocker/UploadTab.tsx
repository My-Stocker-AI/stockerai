import { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle2, Calendar, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TeamMember {
  user_id: string;
  role: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

export function UploadTab() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<Date>(addDays(new Date(), 1));
  const [selectedDriverId, setSelectedDriverId] = useState<string>('self');
  const [uploading, setUploading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Fetch team members for driver selection
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!userRole?.account_id) return;

      const { data, error } = await supabase
        .from('account_users')
        .select(`
          user_id,
          role,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('account_id', userRole.account_id);

      if (!error && data) {
        setTeamMembers(data as unknown as TeamMember[]);
      }
    };

    fetchTeamMembers();
  }, [userRole?.account_id]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else if (selectedFile) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setUploading(true);
    try {
      // Determine driver ID
      const driverId = selectedDriverId === 'self' ? user.id : selectedDriverId;

      // Create FormData with PDF and metadata
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('date', format(deliveryDate, 'yyyy-MM-dd'));
      formData.append('user_id', driverId);

      // Send to n8n webhook
      const response = await fetch('https://visionairy.app.n8n.cloud/webhook/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();

      // Retry logic to find the newly created route (n8n may take time to insert)
      let newRoute = null;
      const maxRetries = 5;
      const deliveryDateStr = format(deliveryDate, 'yyyy-MM-dd');

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait with exponential backoff: 1s, 2s, 4s, 8s, 16s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));

        const { data } = await supabase
          .from('routes')
          .select('id')
          .eq('route_name', result.route)
          .eq('delivery_date', deliveryDateStr)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          newRoute = data;
          break;
        }
      }

      if (newRoute) {
        await supabase
          .from('route_assignments')
          .insert({
            route_id: newRoute.id,
            user_id: driverId,
            assigned_by: user.id,
          });
      }

      const driverName = selectedDriverId === 'self'
        ? 'yourself'
        : teamMembers.find(m => m.user_id === selectedDriverId)?.profiles?.first_name || 'driver';

      toast({
        title: "Route uploaded!",
        description: `${result.route || 'Route'}: ${result.machines || 0} machines, ${result.items || 0} items. Assigned to ${driverName}.`,
      });

      setFile(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-1">
            Upload Route PDF
          </h2>
          <p className="text-sm text-gray-400">
            Upload your VendMax route PDF to get started
          </p>
        </div>

        {/* Date Picker */}
        <div className="space-y-2">
          <Label className="text-gray-300">Delivery Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  "bg-[#161b22] border-gray-700 text-white hover:bg-[#21262d]"
                )}
              >
                <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                {format(deliveryDate, "EEEE, MMMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-[#161b22] border-gray-700" align="center">
              <CalendarComponent
                mode="single"
                selected={deliveryDate}
                onSelect={(date) => date && setDeliveryDate(date)}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Driver Selection */}
        <div className="space-y-2">
          <Label className="text-gray-300">Assign to Driver</Label>
          <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
            <SelectTrigger className="bg-[#161b22] border-gray-700 text-white">
              <Users className="mr-2 h-4 w-4 text-gray-400" />
              <SelectValue placeholder="Select driver..." />
            </SelectTrigger>
            <SelectContent className="bg-[#161b22] border-gray-700">
              <SelectItem value="self" className="text-white">
                Myself
              </SelectItem>
              {teamMembers
                .filter(m => m.user_id !== user?.id)
                .map((member) => (
                  <SelectItem
                    key={member.user_id}
                    value={member.user_id}
                    className="text-white"
                  >
                    {member.profiles?.first_name} {member.profiles?.last_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Drop zone */}
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center",
            "w-full h-40 rounded-xl border-2 border-dashed",
            "cursor-pointer transition-all duration-200",
            isDragging
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-gray-600 hover:border-gray-500 hover:bg-[#161b22]",
            file && "border-emerald-500 bg-emerald-500/10"
          )}
        >
          <input
            type="file"
            className="hidden"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
          />

          {file ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-white">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">Click to replace</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-gray-700 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400">
                Drag & drop or <span className="text-emerald-400 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PDF files only
              </p>
            </>
          )}
        </label>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          size="lg"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5 mr-2" />
              Upload Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
