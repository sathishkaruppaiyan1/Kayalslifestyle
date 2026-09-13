import { useRef } from "react";
import { Microphone, Camera, CircleNotch } from "@phosphor-icons/react";

/**
 * The mic + camera pair that sits inside every search field. The header
 * uses it to launch the modal in voice/photo mode; the modal uses it with
 * live state (listening / analysing) once open.
 */
interface SearchModeButtonsProps {
  onVoice: () => void;
  onPhoto: (file: File) => void;
  /** Hide the mic where the browser has no speech recognition. */
  voiceSupported?: boolean;
  listening?: boolean;
  analysing?: boolean;
  /** Icon size in px. */
  size?: number;
  className?: string;
}

const SearchModeButtons = ({
  onVoice,
  onPhoto,
  voiceSupported = true,
  listening = false,
  analysing = false,
  size = 20,
  className = "",
}: SearchModeButtonsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      // The header wraps its field in an onClick that opens plain search;
      // stop that so these icons open their own mode instead.
      onClick={(e) => e.stopPropagation()}
    >
      {voiceSupported && (
        <button
          type="button"
          onClick={onVoice}
          aria-label={listening ? "Stop listening" : "Search by voice"}
          aria-pressed={listening}
          title={listening ? "Stop listening" : "Search by voice"}
          className={`p-1.5 rounded-full transition-colors ${
            listening
              ? "bg-primary/15 text-brand-ink animate-pulse"
              : "text-muted-foreground hover:bg-muted hover:text-brand-ink"
          }`}
        >
          <Microphone size={size} weight={listening ? "fill" : "regular"} />
        </button>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={analysing}
        aria-label="Search by photo"
        title="Search by photo"
        className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-brand-ink transition-colors disabled:opacity-50"
      >
        {analysing ? <CircleNotch size={size} className="animate-spin" /> : <Camera size={size} />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPhoto(file);
          // Allow re-selecting the same file
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default SearchModeButtons;
