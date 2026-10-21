import { Dialog } from "@base-ui/react/dialog";

interface EvidenceJob {
  title: string;
  url: string;
  status: string | null;
  fullText: string | null;
  excerpts: string[];
}

interface CompanyEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: EvidenceJob[];
}

export function CompanyEvidenceDialog({ open, onOpenChange, jobs }: CompanyEvidenceDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Popup className="fixed inset-0 z-50 p-pad-4 flex items-start justify-center">
          <div className="w-full max-w-3xl bg-surface border border-line max-h-[80vh] overflow-y-auto mt-8 rounded-panel">
            <div className="p-pad-4 border-b border-line flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-heading">
                Technology Sources
              </Dialog.Title>
              <Dialog.Close className="px-pad-2 py-pad-1 bg-tint text-heading hover:bg-harbour-200">
                Close
              </Dialog.Close>
            </div>
            <div className="p-pad-4 flex flex-col gap-gap-4">
              {jobs.length === 0 ? (
                <p className="text-sm text-muted">No supporting job postings recorded.</p>
              ) : (
                jobs.map((job, index) => (
                  <div key={index} className="border border-line p-pad-3 flex flex-col gap-gap-3">
                    <div className="flex items-center justify-between gap-gap-4">
                      <span className="text-sm font-medium text-heading">{job.title}</span>
                      {job.status === "removed" && (
                        <span className="mt-1 w-fit text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-700">
                          Job removed
                        </span>
                      )}
                    </div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-body underline whitespace-nowrap"
                    >
                      Open job posting
                    </a>
                    {(job.fullText || job.excerpts.length > 0) && (
                      <details className="bg-soft border border-line p-pad-2">
                        <summary className="cursor-pointer text-xs font-medium text-heading">
                          View full posting text
                        </summary>
                        <pre className="mt-2 text-xs text-body whitespace-pre-wrap break-words font-mono">
                          {job.fullText || job.excerpts.join("\n\n")}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
