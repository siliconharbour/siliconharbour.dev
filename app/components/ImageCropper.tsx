import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

type ImageCropperProps = {
  imageSrc: string;
  aspect?: number;
  onCropComplete: (croppedImageBlob: Blob, crop: PixelCrop) => void;
  onCancel: () => void;
};

/**
 * Calculate padding needed to allow image to be cropped with transparent areas
 * when the image doesn't match the required aspect ratio.
 */
function calculatePaddingForAspect(
  imgWidth: number,
  imgHeight: number,
  aspect: number,
): { top: number; left: number; totalWidth: number; totalHeight: number } | null {
  const imgAspect = imgWidth / imgHeight;

  // If the image already matches or exceeds the aspect ratio in the right direction, no padding needed
  // Only add padding if the image is "wrong" for the aspect ratio

  let padTop = 0,
    padLeft = 0;

  if (aspect > imgAspect) {
    // Image is taller than needed (e.g., portrait image for 1:1 crop)
    // Add horizontal padding
    const targetWidth = imgHeight * aspect;
    const extraWidth = targetWidth - imgWidth;
    padLeft = extraWidth / 2;
  } else if (aspect < imgAspect) {
    // Image is wider than needed (e.g., landscape image for 1:1 crop)
    // Add vertical padding
    const targetHeight = imgWidth / aspect;
    const extraHeight = targetHeight - imgHeight;
    padTop = extraHeight / 2;
  } else {
    // Perfect match, no padding needed
    return null;
  }

  return {
    top: padTop,
    left: padLeft,
    totalWidth: imgWidth + padLeft * 2,
    totalHeight: imgHeight + padTop * 2,
  };
}

/**
 * Create a padded image data URL with checkerboard background for transparency indication.
 * The actual output will have transparent background, but this shows users where transparency will be.
 */
async function createPaddedImage(
  originalSrc: string,
  padding: { top: number; left: number; totalWidth: number; totalHeight: number },
): Promise<{ dataUrl: string; originalWidth: number; originalHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = padding.totalWidth;
      canvas.height = padding.totalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Draw checkerboard pattern for transparency indication
      const checkSize = 10;
      for (let y = 0; y < canvas.height; y += checkSize) {
        for (let x = 0; x < canvas.width; x += checkSize) {
          const isEven = (x / checkSize + y / checkSize) % 2 === 0;
          ctx.fillStyle = isEven ? "#f0f0f0" : "#d0d0d0";
          ctx.fillRect(x, y, checkSize, checkSize);
        }
      }

      // Draw the original image centered
      ctx.drawImage(img, padding.left, padding.top);

      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight,
      });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = originalSrc;
  });
}

export function ImageCropper({ imageSrc, aspect, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [paddedImageSrc, setPaddedImageSrc] = useState<string | null>(null);
  const [paddingInfo, setPaddingInfo] = useState<{
    top: number;
    left: number;
    originalWidth: number;
    originalHeight: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);

  // Load and potentially pad the image
  useEffect(() => {
    if (!aspect) {
      // No aspect ratio constraint, use original image
      setPaddedImageSrc(null);
      setPaddingInfo(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      originalImgRef.current = img;
      const padding = calculatePaddingForAspect(img.naturalWidth, img.naturalHeight, aspect);

      if (padding) {
        // Need to pad the image
        try {
          const { dataUrl, originalWidth, originalHeight } = await createPaddedImage(
            imageSrc,
            padding,
          );
          setPaddedImageSrc(dataUrl);
          setPaddingInfo({
            top: padding.top,
            left: padding.left,
            originalWidth,
            originalHeight,
          });
        } catch (e) {
          console.error("Failed to create padded image:", e);
          setPaddedImageSrc(null);
          setPaddingInfo(null);
        }
      } else {
        // No padding needed
        setPaddedImageSrc(null);
        setPaddingInfo(null);
      }
    };
    img.src = imageSrc;
  }, [imageSrc, aspect]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;

      // Set initial crop to center of image, covering as much as possible
      let cropWidth: number;
      let cropHeight: number;

      if (aspect) {
        // For aspect-constrained crops, start with the largest possible crop
        // that fits within the image bounds
        if (width / height > aspect) {
          // Image is wider than aspect ratio - constrain by height
          cropHeight = height;
          cropWidth = height * aspect;
        } else {
          // Image is taller than aspect ratio - constrain by width
          cropWidth = width;
          cropHeight = width / aspect;
        }
      } else {
        cropWidth = width * 0.8;
        cropHeight = height * 0.8;
      }

      const x = (width - cropWidth) / 2;
      const y = (height - cropHeight) / 2;

      setCrop({
        unit: "px",
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(cropWidth, width),
        height: Math.min(cropHeight, height),
      });
    },
    [aspect],
  );

  const handleSave = useCallback(async () => {
    if (!completedCrop || !imgRef.current) return;

    const displayedImg = imgRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale from displayed size to natural size
    const scaleX = displayedImg.naturalWidth / displayedImg.width;
    const scaleY = displayedImg.naturalHeight / displayedImg.height;

    // Output canvas size (at natural resolution)
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    if (paddingInfo && originalImgRef.current) {
      // We're working with a padded image - need to extract from original with transparency
      const originalImg = originalImgRef.current;

      // Crop coordinates in the padded image's natural size
      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropW = canvas.width;
      const cropH = canvas.height;

      // Original image position within padded image (in padded image's natural coordinates)
      // These are already at natural resolution from when we created the padded image
      const origX = paddingInfo.left;
      const origY = paddingInfo.top;
      const origW = paddingInfo.originalWidth;
      const origH = paddingInfo.originalHeight;

      // Clear canvas (transparent)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate the intersection between the crop area and the original image
      const intersectLeft = Math.max(cropX, origX);
      const intersectTop = Math.max(cropY, origY);
      const intersectRight = Math.min(cropX + cropW, origX + origW);
      const intersectBottom = Math.min(cropY + cropH, origY + origH);

      if (intersectRight > intersectLeft && intersectBottom > intersectTop) {
        // There is an intersection - draw the visible portion of the original image
        // Source coordinates (where to read from the original image)
        const srcX = intersectLeft - origX;
        const srcY = intersectTop - origY;
        const srcW = intersectRight - intersectLeft;
        const srcH = intersectBottom - intersectTop;

        // Destination coordinates (where to draw on the output canvas)
        const destX = intersectLeft - cropX;
        const destY = intersectTop - cropY;

        ctx.drawImage(originalImg, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);
      }

      // Output as PNG for transparency
      canvas.toBlob((blob) => {
        if (blob) {
          onCropComplete(blob, {
            ...completedCrop,
            x: completedCrop.x * scaleX,
            y: completedCrop.y * scaleY,
            width: completedCrop.width * scaleX,
            height: completedCrop.height * scaleY,
          });
        }
      }, "image/png");
    } else {
      // Standard crop without padding
      ctx.drawImage(
        displayedImg,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCropComplete(blob, {
              ...completedCrop,
              x: completedCrop.x * scaleX,
              y: completedCrop.y * scaleY,
              width: completedCrop.width * scaleX,
              height: completedCrop.height * scaleY,
            });
          }
        },
        "image/jpeg",
        0.95,
      );
    }
  }, [completedCrop, onCropComplete, paddingInfo]);

  const displaySrc = paddedImageSrc || imageSrc;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-4 flex flex-col max-w-[90vw] max-h-[90vh]">
            <Dialog.Title className="text-lg font-semibold mb-4 text-harbour-700">
              Crop Image
            </Dialog.Title>

            {paddingInfo && (
              <p className="text-sm text-harbour-500 mb-2">
                The checkered area will be transparent in the final image.
              </p>
            )}

            <div className="flex-1 min-h-0 flex items-center justify-center">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
              >
                <img
                  ref={imgRef}
                  src={displaySrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  style={{ maxWidth: "80vw", maxHeight: "70vh", display: "block" }}
                />
              </ReactCrop>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <Dialog.Close className="px-4 py-2 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors">
                Cancel
              </Dialog.Close>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-harbour-600 hover:bg-harbour-700 transition-colors"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
