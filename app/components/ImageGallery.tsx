import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { ProjectImage } from "~/db/schema";

interface ImageGalleryProps {
  images: ProjectImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goToPrevious = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(lightboxIndex === 0 ? images.length - 1 : lightboxIndex - 1);
    }
  };

  const goToNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(lightboxIndex === images.length - 1 ? 0 : lightboxIndex + 1);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") goToPrevious();
    if (e.key === "ArrowRight") goToNext();
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-harbour-700">Gallery</h2>

      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {images.map((image, index) => (
          <button
            key={image.id}
            onClick={() => openLightbox(index)}
            className="aspect-video relative overflow-hidden bg-harbour-100 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-harbour-400"
          >
            <img
              src={`/images/${image.image}`}
              alt={image.caption || ""}
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      <Dialog.Root
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) closeLightbox();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/90" />
          <Dialog.Popup
            className="fixed inset-0 z-50 flex items-center justify-center"
            onKeyDown={handleKeyDown}
          >
            {/* Close button */}
            <Dialog.Close
              className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10"
              aria-label="Close lightbox"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Dialog.Close>

            {/* Previous button */}
            {images.length > 1 && lightboxIndex !== null && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
                aria-label="Previous image"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}

            {/* Image */}
            {lightboxIndex !== null && (
              <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center">
                <img
                  src={`/images/${images[lightboxIndex].image}`}
                  alt={images[lightboxIndex].caption || ""}
                  className="max-w-full max-h-[80vh] object-contain"
                />
                {images[lightboxIndex].caption && (
                  <p className="mt-4 text-white/80 text-center max-w-2xl">
                    {images[lightboxIndex].caption}
                  </p>
                )}
                <p className="mt-2 text-white/50 text-sm">
                  {lightboxIndex + 1} / {images.length}
                </p>
              </div>
            )}

            {/* Next button */}
            {images.length > 1 && lightboxIndex !== null && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
                aria-label="Next image"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
