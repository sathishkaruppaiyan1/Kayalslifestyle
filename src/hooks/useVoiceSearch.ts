import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice search on top of the browser's Web Speech API. Nothing leaves the
 * device except through the browser's own recogniser (Chrome, Edge, Safari;
 * Firefox has no support, so `isSupported` is false there and the mic button
 * should be hidden).
 */

// The Web Speech API isn't in lib.dom for every TS target, so keep a
// minimal shape of what we use rather than pulling in a types package.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getRecognitionCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

interface UseVoiceSearchOptions {
  /** Called with the live transcript as the user speaks, then once more when final. */
  onTranscript: (text: string, isFinal: boolean) => void;
  lang?: string;
}

export const useVoiceSearch = ({ onTranscript, lang = "en-IN" }: UseVoiceSearchOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const isSupported = getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // Restarting an in-flight session throws; abort the old one first.
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setError(null);
      setIsListening(true);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event) => {
      // "aborted" and "no-speech" are the user backing out, not failures worth surfacing.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in your browser to search by voice.");
      } else if (event.error === "network") {
        setError("Voice search needs an internet connection.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("Couldn't hear that. Please try again.");
      }
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      onTranscriptRef.current(transcript.trim(), isFinal);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("Couldn't start the microphone.");
      setIsListening(false);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // Don't leave the mic open if the component unmounts mid-sentence.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { isSupported, isListening, error, start, stop, toggle };
};

/** True where the browser can do speech recognition (Chrome, Edge, Safari). */
export const isVoiceSearchSupported = (): boolean => getRecognitionCtor() !== null;
