import { useState, useCallback } from "react";
import { ImageCropper } from "./ImageCropper";

type ImageUploadProps = {
  /** Label for the field */
  label: string;
  /** Hidden input name for new image data */
  name: string;
  /** Hidden input name for existing image (when editing) */
  existingName?: string;
  /** Aspect ratio for cropping (e.g., 16/9 for cover, 1 for icon/avatar) */
  aspect: number;
  /** Existing image filename (for edit mode) */
  existingImage?: string | null;
  /** Preview style: 'cover' for 16:9, 'square' for 1:1 */
  previewStyle?: "cover" | "square";
  /** Help text shown below the upload area */
  helpText?: string;
};

export function ImageUpload({
  label,
  name,
  existingName,
  aspect,
  existingImage,
  previewStyle = "cover",
  helpText,
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(
    existingImage ? `/images/${existingImage}` : null
  );
  const [imageData, setImageData] = useState<string | null>(null);
  const [cropperState, setCropperState] = useState<{
    src: string;
  } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropperState({
        src: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = useCallback((blob: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setImageData(dataUrl);
      setCropperState(null);
    };
    reader.readAsDataURL(blob);
  }, []);

  const handleRemove = () => {
    setPreview(null);
    setImageData(null);
  };

  const isSquare = previewStyle === "square";

  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-2 text-harbour-700">
          {label}
        </label>
        {preview ? (
          <div className={`relative ${isSquare ? "w-32" : "w-full"}`}>
            <img
              src={preview}
              alt="Preview"
              className={`${
                isSquare ? "w-32 h-32" : "w-full aspect-video"
              } object-cover`}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 p-1 bg-red-600 text-white"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ) : (
          <label
            className={`flex flex-col items-center justify-center ${
              isSquare ? "w-32 h-32" : "w-full aspect-video"
            } border-2 border-dashed border-harbour-300 cursor-pointer hover:bg-harbour-50 transition-colors`}
          >
            <svg
              className="w-8 h-8 text-harbour-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <span className="mt-2 text-sm text-harbour-400">
              {helpText || (isSquare ? "Upload (1:1)" : "Upload (16:9)")}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      {/* Hidden inputs for form submission */}
      {imageData && <input type="hidden" name={name} value={imageData} />}
      {existingImage && !imageData && preview && existingName && (
        <input type="hidden" name={existingName} value={existingImage} />
      )}

      {/* Cropper Modal */}
      {cropperState && (
        <ImageCropper
          imageSrc={cropperState.src}
          aspect={aspect}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperState(null)}
        />
      )}
    </>
  );
}
