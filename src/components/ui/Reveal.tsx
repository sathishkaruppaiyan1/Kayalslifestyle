import type { ReactNode } from "react";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

/**
 * Wraps a page section so it fades up the first time it scrolls into view.
 *
 * Renders a plain <div>, so it can go around any section without disturbing
 * layout. Motion itself lives in the .reveal utility in index.css, which is
 * also where prefers-reduced-motion switches it off.
 */
interface RevealProps {
  children: ReactNode;
  /** Stagger sibling sections, in milliseconds. */
  delay?: number;
  className?: string;
}

const Reveal = ({ children, delay = 0, className = "" }: RevealProps) => {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`reveal ${revealed ? "is-revealed" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

export default Reveal;
