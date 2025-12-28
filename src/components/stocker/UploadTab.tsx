import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UploadTab() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

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
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFile(file.name);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file.name);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-8">
      <div className="w-full max-w-sm">
        <h2 className="text-xl font-semibold text-foreground mb-2 text-center">
          Upload Route Data
        </h2>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Upload your route file to get started
        </p>
        
        {/* Drop zone */}
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center",
            "w-full h-48 rounded-2xl border-2 border-dashed",
            "cursor-pointer transition-all duration-200",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-muted/50",
            uploadedFile && "border-primary bg-primary/5"
          )}
        >
          <input
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
          />
          
          {uploadedFile ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">{uploadedFile}</p>
              <p className="text-xs text-muted-foreground mt-1">Click to replace</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Drag & drop or <span className="text-primary font-medium">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV, Excel files supported
              </p>
            </>
          )}
        </label>
        
        {uploadedFile && (
          <Button className="w-full mt-4" size="lg">
            <FileText className="w-5 h-5 mr-2" />
            Process Route File
          </Button>
        )}
      </div>
    </div>
  );
}
