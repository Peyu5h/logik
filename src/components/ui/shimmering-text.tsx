"use client";
import React, { useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "~/lib/utils";

interface ShimmeringTextProps {
  text: string;
  duration?: number;
  delay?: number;
  repeat?: boolean;
  repeatDelay?: number;
  className?: string;
  startOnView?: boolean;
  once?: boolean;
  spread?: number;
}

export function ShimmeringText({
  text,
  duration = 2,
  delay = 0,
  repeat = true,
  repeatDelay = 0.5,
  className,
  startOnView = true,
  once = false,
  spread = 2,
}: ShimmeringTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once });

  const shouldAnimate = !startOnView || isInView;

  return (
    <motion.span
      ref={ref}
      className={cn("inline-block", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #aaa 0%, #fff 40%, #aaa 60%, #aaa 100%)",
        backgroundSize: "200% 100%", // key: makes gradient wider than the element
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        backgroundPosition: "100% 0%", // starts offscreen right
      }}
      animate={
        shouldAnimate
          ? { backgroundPosition: ["200% 0%", "-100% 0%"] } // travels left smoothly
          : {}
      }
      transition={{
        duration,
        delay,
        repeat: repeat ? Infinity : 0,
        repeatDelay,
        ease: "linear",
      }}
    >
      {text}
    </motion.span>
  );
}
