import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, X, ImageIcon, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  selected: boolean;
}

interface ArtifactImageGalleryProps {
  images: ImageFile[];
  onImagesChange: (images: ImageFile[]) => void;
}

export function ArtifactImageGallery({ images, onImagesChange }: ArtifactImageGalleryProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addFiles(files);
  }, [images, onImagesChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      addFiles(files);
    }
  }, [images, onImagesChange]);

  const addFiles = (files: File[]) => {
    const newImages: ImageFile[] = files.map(file => ({
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      selected: true,
    }));
    onImagesChange([...images, ...newImages]);
  };

  const toggleSelection = (id: string) => {
    onImagesChange(images.map(img => 
      img.id === id ? { ...img, selected: !img.selected } : img
    ));
  };

  const removeImage = (id: string) => {
    const img = images.find(i => i.id === id);
    if (img) {
      URL.revokeObjectURL(img.preview);
    }
    onImagesChange(images.filter(img => img.id !== id));
  };

  const selectAll = () => {
    onImagesChange(images.map(img => ({ ...img, selected: true })));
  };

  const selectNone = () => {
    onImagesChange(images.map(img => ({ ...img, selected: false })));
  };

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    onImagesChange([]);
  };

  const selectedCount = images.filter(img => img.selected).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Drop Zone - Matching Excel style */}
      <div
        className={cn(
          "flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors min-h-[200px] max-h-[250px]",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ImageIcon className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop images here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
        <Button variant="outline" onClick={() => document.getElementById('image-input')?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Select Images
        </Button>
        <p className="text-xs text-muted-foreground">
          Supports JPG, PNG, GIF, WebP
        </p>
        <input
          id="image-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Actions */}
      {images.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={selectAll}>
            <CheckSquare className="h-4 w-4 mr-1" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone}>
            <Square className="h-4 w-4 mr-1" />
            Select None
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {selectedCount} of {images.length} selected
          </span>
        </div>
      )}

      {/* Gallery */}
      <ScrollArea className="flex-1">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No images added yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-1">
            {images.map(img => (
              <div
                key={img.id}
                className={cn(
                  "relative group rounded-lg overflow-hidden border-2 transition-colors",
                  img.selected ? "border-primary" : "border-transparent"
                )}
              >
                <img
                  src={img.preview}
                  alt={img.file.name}
                  className="w-full aspect-square object-cover"
                />
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                {/* Checkbox */}
                <div className="absolute top-2 left-2">
                  <Checkbox
                    checked={img.selected}
                    onCheckedChange={() => toggleSelection(img.id)}
                    className="bg-background/80"
                  />
                </div>
                
                {/* Remove button */}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(img.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                
                {/* File name */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                  <p className="text-xs text-white truncate">{img.file.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}